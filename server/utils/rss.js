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
