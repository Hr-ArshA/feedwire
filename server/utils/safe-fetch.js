import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 5;

function blocked(message) {
  return createError({
    statusCode: 400,
    statusMessage: message,
    data: { error: message },
  });
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIp(ip) {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version !== 6) return true;

  const value = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === '::' || value === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true; // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(value)) return true; // link-local fe80::/10

  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Rejects anything that could reach the host machine or the local network.
 * DNS is resolved here and every returned address is checked, which stops the
 * obvious `http://127.0.0.1` / `http://169.254.169.254` tricks.
 */
export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw blocked('Enter a valid http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw blocked('Only http and https URLs are supported');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw blocked('URL has no host');

  if (isIP(host)) {
    if (isPrivateIp(host)) throw blocked('That address is not allowed');
    return url;
  }

  let records;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw blocked(`Could not resolve ${host}`);
  }
  if (!records.length) throw blocked(`Could not resolve ${host}`);
  if (records.some((record) => isPrivateIp(record.address))) {
    throw blocked('That address is not allowed');
  }
  return url;
}

async function readCapped(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('Response is too large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks);
}

/**
 * fetch() with a URL allow-list check on every hop, a byte cap and a timeout.
 */
export async function safeFetch(rawUrl, options = {}) {
  const {
    maxBytes = 8 * 1024 * 1024,
    timeoutMs = 20_000,
    accept = '*/*',
    userAgent = 'Feedwire/2.0 (+self-hosted RSS reader)',
  } = options;

  let current = await assertPublicUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    // A plain AbortController is used instead of AbortSignal.timeout(): some
    // CDNs (Google Storage, for one) answer the latter with a spurious 403.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      let response;
      try {
        response = await fetch(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { accept, 'user-agent': userAgent },
        });
      } catch (error) {
        throw new Error(
          timedOut
            ? 'Request timed out'
            : `Could not reach the server: ${error.message}`
        );
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { status: response.status, buffer: Buffer.alloc(0), contentType: '', finalUrl: current.toString() };
        }
        current = await assertPublicUrl(new URL(location, current).toString());
        continue;
      }

      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > maxBytes) throw new Error('Response is too large');

      let buffer;
      try {
        buffer = await readCapped(response, maxBytes);
      } catch (error) {
        throw new Error(timedOut ? 'Request timed out' : error.message);
      }

      return {
        status: response.status,
        buffer,
        contentType: response.headers.get('content-type') ?? '',
        finalUrl: current.toString(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Too many redirects');
}
