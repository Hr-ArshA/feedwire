import { safeFetch } from './safe-fetch.js';
import { cacheGet, cacheSet } from './redis.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_BATCH_BYTES = 1024 * 1024;

/**
 * Google News RSS entries point at `news.google.com/rss/articles/<id>`, an
 * opaque shell that redirects through JavaScript. It cannot be scraped with
 * Readability, so we resolve it to the real publisher URL first.
 */
export function isGoogleNewsUrl(raw) {
  try {
    const url = new URL(String(raw));
    return (
      url.hostname === 'news.google.com' &&
      url.pathname.startsWith('/rss/articles/')
    );
  } catch {
    return false;
  }
}

function articleIdOf(raw) {
  try {
    const parts = new URL(String(raw)).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

function pickPublisherUrl(value) {
  if (typeof value !== 'string') return null;
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const host = new URL(value).hostname;
    if (/(^|\.)google\.com$/i.test(host)) return null;
  } catch {
    return null;
  }
  return value;
}

async function viaBatchexecute(articleId, signature, timestamp) {
  const inner = JSON.stringify([
    'garturlreq',
    [
      ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
      'X',
      'X',
      1,
      [2, 3, 4, 8],
      1,
      0,
      'X',
      0,
      0,
      null,
      0,
    ],
    articleId,
    Number(timestamp),
    signature,
  ]);

  const body =
    'f.req=' +
    encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));

  const response = await safeFetch(
    'https://news.google.com/_/DotsSplashUi/data/batchexecute',
    {
      method: 'POST',
      userAgent: BROWSER_UA,
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      maxBytes: MAX_BATCH_BYTES,
      timeoutMs: 15_000,
    }
  );

  const text = response.buffer.toString('utf8');
  const line = text.split('\n').find((entry) => entry.startsWith('[["wrb.fr"'));
  if (!line) return null;

  const parsed = JSON.parse(line);
  const payload = parsed?.[0]?.[2];
  if (typeof payload !== 'string') return null;

  const data = JSON.parse(payload);
  return pickPublisherUrl(data?.[1]);
}

function viaMarkup(html) {
  const direct = html.match(/data-n-au="(https?:\/\/[^"]+)"/i)?.[1];
  if (pickPublisherUrl(direct)) return direct;

  for (const match of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    const candidate = pickPublisherUrl(match[1].replace(/&amp;/g, '&'));
    if (candidate) return candidate;
  }
  return null;
}

/**
 * Turns a Google News RSS article link into the publisher URL. Results are
 * cached in Redis and, by the caller, on the `items` row so the redirect is
 * only ever resolved once per story.
 */
export async function resolveGoogleNewsUrl(raw) {
  if (!isGoogleNewsUrl(raw)) return raw;

  const articleId = articleIdOf(raw);
  if (!articleId) throw new Error('Unrecognised Google News link');

  const cacheKey = `gn:${articleId}`;
  const cached = await cacheGet(cacheKey);
  if (cached?.url) return cached.url;

  const page = await safeFetch(raw, {
    userAgent: BROWSER_UA,
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    maxBytes: MAX_PAGE_BYTES,
    timeoutMs: 15_000,
  });
  if (page.status >= 400) {
    throw new Error(`Google News responded with HTTP ${page.status}`);
  }

  const html = page.buffer.toString('utf8');
  const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1];

  let resolved = null;
  if (signature && timestamp) {
    resolved = await viaBatchexecute(articleId, signature, timestamp).catch(
      () => null
    );
  }
  if (!resolved) resolved = viaMarkup(html);

  if (!resolved) {
    throw new Error(
      'Google News did not reveal the publisher link for this story'
    );
  }

  await cacheSet(cacheKey, { url: resolved }, CACHE_TTL_SECONDS);
  return resolved;
}
