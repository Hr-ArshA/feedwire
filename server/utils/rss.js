import { XMLParser } from 'fast-xml-parser';
import { safeFetch } from './safe-fetch.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === 'item' || name === 'entry',
});

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SUMMARY = 400;

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const num =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function toPlainText(value, limit = MAX_SUMMARY) {
  if (value == null) return '';
  const raw = typeof value === 'string' ? value : text(value);
  const cleaned = decodeEntities(
    raw
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const attr = tag.match(/\b(?:alt|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        return ` ${attr?.[1] ?? attr?.[2] ?? ''} `;
      })
      .replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>|<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1).trimEnd()}…` : cleaned;
}

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object') {
    if ('#text' in value) return text(value['#text']);
    if ('@_href' in value) return String(value['@_href']);
  }
  return '';
}

function pickLink(link) {
  if (!link) return '';
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alternate = link.find(
      (entry) => !entry?.['@_rel'] || entry['@_rel'] === 'alternate'
    );
    return text(alternate ?? link[0]);
  }
  if (typeof link === 'object') return text(link['@_href'] ?? link);
  return '';
}

function resolveUrl(link, base) {
  if (!link) return null;
  try {
    return new URL(link, base).toString();
  } catch {
    return null;
  }
}

function parseDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function makeGuid(item, link, publishedAt) {
  const explicit = text(item.guid ?? item.id);
  if (explicit) return explicit.slice(0, 512);
  if (link) return link.slice(0, 512);
  const fallback = `${text(item.title)}|${publishedAt ?? ''}`;
  return fallback.slice(0, 512) || crypto.randomUUID();
}

function normalizeItem(item, baseUrl) {
  const link = resolveUrl(pickLink(item.link), baseUrl);
  const publishedAt = parseDate(
    item.pubDate ?? item.published ?? item.updated ?? item['dc:date']
  );
  const authorNode = item.author ?? item['dc:creator'] ?? item['itunes:author'];
  const author = toPlainText(
    authorNode && typeof authorNode === 'object'
      ? authorNode.name ?? authorNode
      : authorNode,
    120
  );

  const summary = toPlainText(
    item.description ?? item['content:encoded'] ?? item.summary ?? item.content
  );

  return {
    guid: makeGuid(item, link, publishedAt),
    title: toPlainText(item.title, 300) || '(untitled)',
    link,
    author: author || null,
    summary:
      summary && !/^(?:comments|article url|comments url)$/i.test(summary)
        ? summary
        : null,
    commentsUrl: resolveUrl(text(item.comments), baseUrl),
    publishedAt,
  };
}

export function parseFeed(xml, feedUrl) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch (error) {
    throw new Error(`Could not parse XML: ${error.message}`);
  }

  const rss = doc.rss?.channel;
  const rdf =
    doc['rdf:RDF'] ?? doc.RDF ?? (doc.channel && doc.item ? doc : undefined);
  const atom = doc.feed;
  const channel = rss ?? rdf;

  if (!channel && !atom) {
    throw new Error('Not an RSS or Atom feed');
  }

  const rawItems = channel?.item ?? atom?.entry ?? [];
  const title = toPlainText(channel?.title ?? atom?.title, 200);
  const siteUrl = resolveUrl(
    pickLink(channel?.link ?? atom?.link),
    feedUrl
  );

  const seen = new Set();
  const items = [];
  for (const raw of Array.isArray(rawItems) ? rawItems : [rawItems]) {
    if (!raw || typeof raw !== 'object') continue;
    const item = normalizeItem(raw, siteUrl ?? feedUrl);
    if (seen.has(item.guid)) continue;
    seen.add(item.guid);
    items.push(item);
  }

  return { title, siteUrl, items };
}

export async function fetchFeed(feedUrl) {
  try {
    return await fetchDirect(feedUrl);
  } catch (error) {
    if (!shouldMirror(error)) throw error;
    return fetchViaGoogleNews(feedUrl, error);
  }
}

async function fetchDirect(feedUrl) {
  const { status, buffer, finalUrl } = await safeFetch(feedUrl, {
    maxBytes: MAX_BYTES,
    timeoutMs: 20_000,
    accept:
      'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    userAgent: 'Feedwire/2.0 (+self-hosted RSS reader)',
  });

  if (status >= 400) {
    throw new Error(`Feed responded with HTTP ${status}`);
  }

  return parseFeed(buffer.toString('utf8'), finalUrl || feedUrl);
}

/**
 * Some publishers (BBC is the common one) refuse connections from certain
 * networks. When the direct fetch fails at the network or 401/403/429/5xx
 * level, fall back to a Google News search feed for the same site so the
 * subscription still works. Items then point at Google News and are resolved
 * to the publisher URL by the normal Google News resolver.
 */
function shouldMirror(error) {
  const message = String(error?.message ?? '');
  if (
    /Could not reach|timed out|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|That address is not allowed|Could not resolve/i.test(
      message
    )
  ) {
    return true;
  }
  return /HTTP (401|403|429|5\d\d)\b/.test(message);
}

const MIRROR_SITES = {
  'feeds.bbci.co.uk': 'bbc.com',
  'bbci.co.uk': 'bbc.com',
  'bbc.co.uk': 'bbc.com',
  'bbc.com': 'bbc.com',
};

function mirrorSiteHost(feedUrl) {
  let host;
  try {
    host = new URL(feedUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (MIRROR_SITES[host]) return MIRROR_SITES[host];
  const parts = host.split('.');
  if (parts.length > 2 && ['feeds', 'rss', 'feed'].includes(parts[0])) {
    return parts.slice(1).join('.');
  }
  return host;
}

function publisherFromTitles(items, host) {
  for (const item of items) {
    const match = / - ([^-]{2,40})$/.exec(String(item.title ?? ''));
    if (match) return match[1].trim();
  }
  return host.replace(/^www\./, '');
}

async function fetchViaGoogleNews(feedUrl, originalError) {
  const host = mirrorSiteHost(feedUrl);
  if (!host) throw originalError;

  const mirrorUrl =
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(`site:${host}`) +
    '&hl=en-US&gl=US&ceid=US:en';

  try {
    const { status, buffer, finalUrl } = await safeFetch(mirrorUrl, {
      maxBytes: MAX_BYTES,
      timeoutMs: 20_000,
      accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      userAgent: 'Feedwire/2.0 (+self-hosted RSS reader)',
    });
    if (status >= 400) throw new Error(`Mirror responded with HTTP ${status}`);

    const parsed = parseFeed(buffer.toString('utf8'), finalUrl || mirrorUrl);
    if (!parsed.items.length) throw new Error('Mirror returned no items');

    return {
      ...parsed,
      title: `${publisherFromTitles(parsed.items, host)} (via Google News)`,
      siteUrl: `https://${host}`,
    };
  } catch {
    throw new Error(
      `${originalError.message}. This network cannot reach the publisher; use a VPN or proxy, or add the site through Google News.`
    );
  }
}
