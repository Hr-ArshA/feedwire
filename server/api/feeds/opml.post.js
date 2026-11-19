import { XMLParser } from 'fast-xml-parser';
import { requireUser } from '../../utils/auth.js';
import {
  findOrCreateFeed,
  getStats,
  listUserFeeds,
  normalizeFeedUrl,
  refreshFeed,
  subscribe,
} from '../../utils/feeds.js';

const MAX_FEEDS = 60;
const MAX_REFRESH = 10;
const MAX_BYTES = 2 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === 'outline',
});

function collectOutlines(node, out) {
  if (!node) return;
  const list = Array.isArray(node) ? node : [node];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const url = entry['@_xmlUrl'] ?? entry['@_xmlurl'] ?? entry['@_XMLURL'];
    if (url) {
      out.push({
        url: String(url).trim(),
        title: String(entry['@_title'] ?? entry['@_text'] ?? '').trim(),
        htmlUrl: entry['@_htmlUrl'] ?? entry['@_htmlurl'] ?? null,
      });
    }
    if (entry.outline) collectOutlines(entry.outline, out);
  }
}

async function readXml(event) {
  const type = String(getHeader(event, 'content-type') ?? '');
  if (type.includes('application/json')) {
    const body = (await readBody(event).catch(() => ({}))) ?? {};
    return String(body.xml ?? body.opml ?? '');
  }
  const raw = await readRawBody(event, 'utf8');
  return String(raw ?? '');
}

/** Imports an OPML file, subscribing the caller to every feed it lists. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const xml = await readXml(event);

  if (!xml.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Empty OPML file',
      data: { error: 'Empty OPML file' },
    });
  }
  if (Buffer.byteLength(xml, 'utf8') > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'OPML file is too large',
      data: { error: 'OPML file is too large' },
    });
  }

  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'That file is not valid OPML',
      data: { error: 'That file is not valid OPML' },
    });
  }

  const outlines = [];
  collectOutlines(parsed?.opml?.body?.outline, outlines);

  const seen = new Set();
  const candidates = [];
  for (const outline of outlines) {
    if (candidates.length >= MAX_FEEDS) break;
    let url;
    try {
      url = normalizeFeedUrl(outline.url);
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({ ...outline, url });
  }

  if (!candidates.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No feeds found in that OPML file',
      data: { error: 'No feeds found in that OPML file' },
    });
  }

  let imported = 0;
  let reused = 0;
  let refreshed = 0;
  const failed = [];

  for (const candidate of candidates) {
    try {
      const { feed, created } = await findOrCreateFeed(candidate.url);
      await subscribe(user.id, feed.id);
      if (created) imported += 1;
      else reused += 1;

      if (created && refreshed < MAX_REFRESH) {
        refreshed += 1;
        const result = await refreshFeed(feed.id, { force: true });
        if (result.error) failed.push({ url: candidate.url, error: result.error });
      }
    } catch (error) {
      failed.push({ url: candidate.url, error: error.message });
    }
  }

  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);

  return {
    total: candidates.length,
    imported,
    reused,
    refreshed,
    failed,
    feeds,
    stats,
  };
});
