import { assertPublicUrl, safeFetch } from '../../utils/safe-fetch.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function startsWith(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * Many CDNs (Google Storage, S3, …) serve images as
 * `application/octet-stream`. Sniffing the magic bytes lets us accept those
 * while still refusing anything that is not actually an image.
 */
function sniffImageType(buffer) {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.subarray(4, 12).toString('latin1').startsWith('ftypavi')) {
    return 'image/avif';
  }
  if (startsWith(buffer, [0x42, 0x4d])) return 'image/bmp';
  if (startsWith(buffer, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';

  const head = buffer.subarray(0, 512).toString('utf8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml';
  }
  return null;
}

/**
 * Same-origin image proxy used by the reader view. Article HTML is rewritten to
 * point every <img> here, which keeps hot-linking/referrer issues out of the
 * way while the SSRF guard still blocks private addresses.
 */
export default defineEventHandler(async (event) => {
  const { u } = getQuery(event);
  const target = String(u ?? '').trim();
  if (!target) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing image url',
      data: { error: 'Missing image url' },
    });
  }

  const url = await assertPublicUrl(target);

  let result;
  try {
    result = await safeFetch(url.toString(), {
      maxBytes: MAX_IMAGE_BYTES,
      timeoutMs: 25_000,
      accept: 'image/*,*/*;q=0.5',
    });
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not load image',
      data: { error: error.message },
    });
  }

  if (result.status >= 400) {
    throw createError({
      statusCode: 502,
      statusMessage: `Image responded with HTTP ${result.status}`,
      data: { error: `Image responded with HTTP ${result.status}` },
    });
  }

  const declared = (result.contentType || '').split(';')[0].trim().toLowerCase();
  const type = declared.startsWith('image/') ? declared : sniffImageType(result.buffer);
  if (!type) {
    throw createError({
      statusCode: 415,
      statusMessage: 'That URL is not an image',
      data: { error: 'That URL is not an image' },
    });
  }

  setHeader(event, 'content-type', type);
  setHeader(event, 'cache-control', 'public, max-age=86400, immutable');
  setHeader(event, 'x-content-type-options', 'nosniff');
  return result.buffer;
});
