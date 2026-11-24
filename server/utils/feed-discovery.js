import { parseHTML } from 'linkedom';
import { safeFetch } from './safe-fetch.js';

const MAX_HTML_BYTES = 900 * 1024;
const COMMON_PATHS = [
  '/feed',
  '/rss',
  '/rss.xml',
  '/atom.xml',
  '/feed.xml',
  '/index.xml',
];
const FEED_TYPES = /(rss|atom|xml)/i;

function looksLikeFeed(buffer) {
  const head = buffer.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  return (
    head.startsWith('<?xml') ||
    head.includes('<rss') ||
    head.includes('<feed') ||
    head.includes('<rdf')
  );
}

function findAlternate(html, base) {
  let document;
  try {
    ({ document } = parseHTML(html));
  } catch {
    return null;
  }

  for (const link of document.querySelectorAll('link[rel][href]')) {
    const rel = (link.getAttribute('rel') || '').toLowerCase().split(/\s+/);
    if (!rel.includes('alternate')) continue;
    const type = (link.getAttribute('type') || '').toLowerCase();
    if (type && !FEED_TYPES.test(type)) continue;
    const href = link.getAttribute('href');
    if (!href) continue;
    try {
      return new URL(href, base).href;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/**
 * Turn a website URL into its feed: read `<link rel="alternate">` from the
 * page, then probe the usual feed paths. Returns null when nothing is found.
 */
export async function discoverFeedUrl(rawUrl) {
  let base;
  try {
    base = new URL(rawUrl);
  } catch {
    return null;
  }
  base.hash = '';

  try {
    const { status, buffer, contentType } = await safeFetch(base.href, {
      maxBytes: MAX_HTML_BYTES,
      timeoutMs: 12_000,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    });
    if (status < 400 && looksLikeFeed(buffer)) return base.href;
    if (status < 400 && /html|text\/plain/i.test(String(contentType || 'html'))) {
      const alternate = findAlternate(buffer.toString('utf8'), base.href);
      if (alternate) return alternate;
    }
  } catch {
    /* fall through to the common paths */
  }

  for (const path of COMMON_PATHS) {
    const candidate = new URL(path, base.origin).href;
    try {
      const { status, buffer } = await safeFetch(candidate, {
        maxBytes: 256 * 1024,
        timeoutMs: 8_000,
        accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      });
      if (status < 400 && looksLikeFeed(buffer)) return candidate;
    } catch {
      /* try the next path */
    }
  }

  return null;
}
