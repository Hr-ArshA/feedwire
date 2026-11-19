import { fetchFeed } from './rss.js';
import { normalizeText } from './text.js';
import { embedQuery, CATEGORIES } from './embeddings.js';

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
];

const STALE_AFTER_MINUTES = 10;
const SEARCH_POOL = 80;
const RRF_K = 60;

function badRequest(message) {
  return createError({ statusCode: 400, statusMessage: message, data: { error: message } });
}

/**
 * Canonical feed identity. Two users pasting the same feed — with or without
 * tracking params, trailing slash or different letter case — must resolve to
 * one row in `feeds`, so the items (and their vectors) are only ever stored once.
 */
export function normalizeFeedUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) throw badRequest('Feed URL is required');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw badRequest('Enter a valid http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest('Only http and https feeds are supported');
  }

  url.hash = '';
  for (const key of TRACKING_PARAMS) url.searchParams.delete(key);

  const search = url.searchParams.toString();
  let path = url.pathname;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path === '/') path = '';
  return `${url.protocol}//${url.host}${path}${search ? `?${search}` : ''}`;
}

function paramsBuilder() {
  const values = [];
  return {
    values,
    add(value) {
      values.push(value);
      return `$${values.length}`;
    },
  };
}

/* ------------------------------------------------------------------ feeds */

export async function findOrCreateFeed(rawUrl, { isPublic = false } = {}) {
  const url = normalizeFeedUrl(rawUrl);

  const inserted = await query(
    `INSERT INTO feeds (url, is_public) VALUES ($1, $2)
     ON CONFLICT (url) DO NOTHING
     RETURNING id, url, title, site_url, is_public, last_fetched_at, last_error`,
    [url, isPublic]
  );
  if (inserted.rows[0]) {
    return { feed: inserted.rows[0], created: true };
  }

  const { rows } = await query(
    `SELECT id, url, title, site_url, is_public, last_fetched_at, last_error
       FROM feeds WHERE url = $1`,
    [url]
  );
  return { feed: rows[0], created: false };
}

export async function getFeed(feedId) {
  const { rows } = await query(
    `SELECT id, url, title, site_url, is_public, last_fetched_at, last_error
       FROM feeds WHERE id = $1`,
    [feedId]
  );
  return rows[0] ?? null;
}

export async function isSubscribed(userId, feedId) {
  const { rowCount } = await query(
    'SELECT 1 FROM subscriptions WHERE user_id = $1 AND feed_id = $2',
    [userId, feedId]
  );
  return rowCount > 0;
}

export async function subscribe(userId, feedId) {
  await query(
    `INSERT INTO subscriptions (user_id, feed_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, feedId]
  );
  await cacheDel(`user:${userId}:feeds`, `user:${userId}:categories`);
}

/**
 * Removing a feed only drops the caller's subscription. The shared feed — with
 * its items and vectors — stays intact for every other subscriber.
 */
export async function unsubscribe(userId, feedId) {
  const { rowCount } = await query(
    'DELETE FROM subscriptions WHERE user_id = $1 AND feed_id = $2',
    [userId, feedId]
  );
  if (rowCount) {
    await query(
      `DELETE FROM feeds f
        WHERE f.id = $1
          AND f.is_public = false
          AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.feed_id = f.id)`,
      [feedId]
    );
    await cacheDel(`user:${userId}:feeds`);
  }
  return rowCount > 0;
}

/* ---------------------------------------------------------------- refresh */

export async function saveItems(feedId, items) {
  if (!items.length) return 0;

  const guids = items.map((item) => item.guid);
  const titles = items.map((item) => item.title);
  const links = items.map((item) => item.link ?? null);
  const authors = items.map((item) => item.author ?? null);
  const summaries = items.map((item) => item.summary ?? null);
  const comments = items.map((item) => item.commentsUrl ?? null);
  const published = items.map((item) => item.publishedAt ?? null);
  const searchTexts = items.map((item) =>
    normalizeText(`${item.title} ${item.summary ?? ''}`).slice(0, 4000)
  );

  const { rowCount } = await query(
    `INSERT INTO items
       (feed_id, guid, title, link, author, summary, comments_url, published_at, search_text)
     SELECT $1, t.guid, t.title, t.link, t.author, t.summary, t.comments_url,
            t.published_at, t.search_text
       FROM unnest(
         $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
         $7::text[], $8::timestamptz[], $9::text[]
       ) AS t(guid, title, link, author, summary, comments_url, published_at, search_text)
     ON CONFLICT (feed_id, guid) DO NOTHING`,
    [feedId, guids, titles, links, authors, summaries, comments, published, searchTexts]
  );
  return rowCount;
}

export async function refreshFeed(feedId, { force = false } = {}) {
  const feed = await getFeed(feedId);
  if (!feed) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed not found',
      data: { error: 'Feed not found' },
    });
  }

  if (
    !force &&
    feed.last_fetched_at &&
    Date.now() - new Date(feed.last_fetched_at).getTime() < STALE_AFTER_MINUTES * 60_000
  ) {
    return { inserted: 0, skipped: true, title: feed.title, error: null };
  }

  const lock = await query(
    `UPDATE feeds SET fetch_started_at = now()
      WHERE id = $1
        AND (fetch_started_at IS NULL OR fetch_started_at < now() - interval '90 seconds')
      RETURNING id`,
    [feedId]
  );
  if (!lock.rowCount) {
    return { inserted: 0, skipped: true, title: feed.title, error: null };
  }

  try {
    const parsed = await fetchFeed(feed.url);
    const inserted = await saveItems(feedId, parsed.items);
    await query(
      `UPDATE feeds
          SET title = COALESCE(NULLIF($2, ''), title),
              site_url = COALESCE($3, site_url),
              last_fetched_at = now(),
              last_error = NULL,
              fetch_started_at = NULL
        WHERE id = $1`,
      [feedId, parsed.title ?? '', parsed.siteUrl ?? null]
    );
    await cacheDel(`feed:${feedId}`, 'categories:global');
    return { inserted, skipped: false, title: parsed.title, error: null };
  } catch (error) {
    await query(
      'UPDATE feeds SET last_error = $2, fetch_started_at = NULL WHERE id = $1',
      [feedId, error.message]
    );
    return { inserted: 0, skipped: false, title: feed.title, error: error.message };
  }
}

export async function refreshUserFeeds(userId) {
  const { rows } = await query(
    `SELECT f.id, f.title FROM feeds f
       JOIN subscriptions s ON s.feed_id = f.id
      WHERE s.user_id = $1
      ORDER BY f.created_at`,
    [userId]
  );
  const results = [];
  for (const feed of rows) {
    const result = await refreshFeed(feed.id);
    results.push({ id: feed.id, title: result.title ?? feed.title, ...result });
  }
  return results;
}

/* ------------------------------------------------------------- read model */

const ITEM_COLUMNS = `
  i.id, i.feed_id, i.title, i.link, i.resolved_link, i.author, i.summary,
  i.comments_url,
  i.published_at, i.fetched_at, i.category, i.category_score,
  (i.content_html IS NOT NULL) AS has_content,
  f.title AS feed_title, f.url AS feed_url
`;

function stateJoin(userIdParam) {
  return userIdParam
    ? `LEFT JOIN user_items ui ON ui.item_id = i.id AND ui.user_id = ${userIdParam}`
    : '';
}

function stateColumns(userIdParam) {
  return userIdParam
    ? `COALESCE(ui.is_read, false) AS is_read,
       COALESCE(ui.is_favorite, false) AS is_favorite`
    : `false AS is_read, false AS is_favorite`;
}

function buildScope({ userId, feedId, filter, category }) {
  const pb = paramsBuilder();
  const where = [];
  const userParam = userId ? pb.add(userId) : null;

  if (userParam) {
    where.push(
      `i.feed_id IN (SELECT feed_id FROM subscriptions WHERE user_id = ${userParam})`
    );
  } else {
    where.push('f.is_public = true');
  }
  if (feedId) where.push(`i.feed_id = ${pb.add(feedId)}`);
  if (category) where.push(`i.category = ${pb.add(category)}`);
  if (userParam && filter === 'unread') where.push('NOT COALESCE(ui.is_read, false)');
  if (userParam && filter === 'favorite') where.push('COALESCE(ui.is_favorite, false)');

  return {
    pb,
    userParam,
    join: stateJoin(userParam),
    columns: stateColumns(userParam),
    where: where.join(' AND '),
  };
}

function mapRow(row) {
  return {
    id: Number(row.id),
    feed_id: row.feed_id,
    title: row.title,
    link: row.link,
    resolved_link: row.resolved_link,
    author: row.author,
    summary: row.summary,
    comments_url: row.comments_url,
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    category: row.category,
    category_score: row.category_score,
    has_content: row.has_content,
    feed_title: row.feed_title,
    feed_url: row.feed_url,
    is_read: row.is_read,
    is_favorite: row.is_favorite,
  };
}

export async function listItems({
  userId = null,
  feedId = null,
  filter = 'all',
  q = '',
  mode = 'hybrid',
  category = null,
  limit = 50,
  offset = 0,
}) {
  const text = String(q ?? '').trim();
  if (text) {
    return searchItems({ userId, feedId, filter, q: text, mode, category, limit, offset });
  }

  const scope = buildScope({ userId, feedId, filter, category });
  const { pb } = scope;

  const countSql = `
    SELECT count(*)::int AS total
      FROM items i
      JOIN feeds f ON f.id = i.feed_id
      ${scope.join}
     WHERE ${scope.where}`;
  const countResult = await query(countSql, pb.values);
  const total = countResult.rows[0].total;

  const limitParam = pb.add(limit);
  const offsetParam = pb.add(offset);
  const dataSql = `
    SELECT ${ITEM_COLUMNS}, ${scope.columns}
      FROM items i
      JOIN feeds f ON f.id = i.feed_id
      ${scope.join}
     WHERE ${scope.where}
     ORDER BY i.published_at DESC NULLS LAST, i.id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`;
  const { rows } = await query(dataSql, pb.values);

  return {
    items: rows.map(mapRow),
    total,
    hasMore: offset + rows.length < total,
  };
}

function buildTsQuery(text) {
  const tokens = normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1)
    .slice(0, 12);
  if (!tokens.length) return null;
  return tokens.map((token) => `${token}:*`).join(' & ');
}

async function keywordSearch(scope, text) {
  const tsq = buildTsQuery(text);
  if (!tsq) return [];
  const { pb } = scope;
  const tsParam = pb.add(tsq);
  const limitParam = pb.add(SEARCH_POOL);
  // Search the headline/summary index and the full article body together, so a
  // phrase that only appears inside a story still finds that story.
  const sql = `
    SELECT ${ITEM_COLUMNS}, ${scope.columns},
           (
             ts_rank_cd(to_tsvector('simple', i.search_text), to_tsquery('simple', ${tsParam}))
             + ts_rank_cd(to_tsvector('simple', coalesce(i.content_text, '')), to_tsquery('simple', ${tsParam}))
           ) AS rank
      FROM items i
      JOIN feeds f ON f.id = i.feed_id
      ${scope.join}
     WHERE ${scope.where}
       AND (
         to_tsvector('simple', i.search_text) @@ to_tsquery('simple', ${tsParam})
         OR to_tsvector('simple', coalesce(i.content_text, '')) @@ to_tsquery('simple', ${tsParam})
       )
     ORDER BY rank DESC, i.published_at DESC NULLS LAST
     LIMIT ${limitParam}`;
  const { rows } = await query(sql, pb.values);
  return rows.map(mapRow);
}

async function semanticSearch(scope, text) {
  const vector = await embedQuery(text);
  const { pb } = scope;
  const vecParam = pb.add(Array.from(vector, (value) => Number(value)));
  const limitParam = pb.add(SEARCH_POOL);
  const sql = `
    SELECT ${ITEM_COLUMNS}, ${scope.columns},
           GREATEST(
             COALESCE(dot_product(i.embedding, ${vecParam}::real[]), -1),
             COALESCE(dot_product(i.content_embedding, ${vecParam}::real[]), -1)
           ) AS score
      FROM items i
      JOIN feeds f ON f.id = i.feed_id
      ${scope.join}
     WHERE ${scope.where}
       AND (i.embedding IS NOT NULL OR i.content_embedding IS NOT NULL)
     ORDER BY score DESC
     LIMIT ${limitParam}`;
  const { rows } = await query(sql, pb.values);
  return rows.map(mapRow);
}

function reciprocalRankFusion(lists) {
  const scores = new Map();
  for (const list of lists) {
    list.forEach((item, index) => {
      const entry = scores.get(item.id) ?? { item, score: 0 };
      entry.score += 1 / (RRF_K + index + 1);
      scores.set(item.id, entry);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

async function searchItems({ userId, feedId, filter, q, mode, category, limit, offset }) {
  // Each query needs its own parameter list: the keyword and semantic queries
  // run in parallel and would otherwise share (and corrupt) one array.
  const makeScope = () => buildScope({ userId, feedId, filter, category });

  let merged;
  if (mode === 'keyword') {
    merged = await keywordSearch(makeScope(), q);
  } else if (mode === 'semantic') {
    merged = await semanticSearch(makeScope(), q);
  } else {
    const [keyword, semantic] = await Promise.all([
      keywordSearch(makeScope(), q).catch(() => []),
      semanticSearch(makeScope(), q).catch(() => []),
    ]);
    merged = reciprocalRankFusion([keyword, semantic]);
  }

  const slice = merged.slice(offset, offset + limit);
  return {
    items: slice,
    total: merged.length,
    hasMore: offset + slice.length < merged.length,
  };
}

/* ------------------------------------------------------------- aggregates */

export async function listUserFeeds(userId) {
  const cached = await cacheGet(`user:${userId}:feeds`);
  if (cached) return cached;

  const { rows } = await query(
    `SELECT f.id, f.url, f.title, f.site_url, f.last_fetched_at, f.last_error,
            count(i.id)::int AS item_count,
            count(i.id) FILTER (WHERE NOT COALESCE(ui.is_read, false))::int AS unread_count
       FROM subscriptions s
       JOIN feeds f ON f.id = s.feed_id
       LEFT JOIN items i ON i.feed_id = f.id
       LEFT JOIN user_items ui ON ui.item_id = i.id AND ui.user_id = $1
      WHERE s.user_id = $1
      GROUP BY f.id
      ORDER BY f.created_at, f.title`,
    [userId]
  );
  await cacheSet(`user:${userId}:feeds`, rows, 20);
  return rows;
}

export async function getStats(userId) {
  if (!userId) {
    const { rows } = await query(
      `SELECT count(*)::int AS total
         FROM items i JOIN feeds f ON f.id = i.feed_id
        WHERE f.is_public = true`
    );
    return { total: rows[0].total, unread: rows[0].total, favorites: 0 };
  }

  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE NOT COALESCE(ui.is_read, false))::int AS unread,
            count(*) FILTER (WHERE COALESCE(ui.is_favorite, false))::int AS favorites
       FROM items i
       JOIN subscriptions s ON s.feed_id = i.feed_id AND s.user_id = $1
       LEFT JOIN user_items ui ON ui.item_id = i.id AND ui.user_id = $1`,
    [userId]
  );
  return rows[0];
}

export async function getCategoryCounts(userId) {
  const cacheKey = userId ? `user:${userId}:categories` : 'categories:public';
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const { rows } = userId
    ? await query(
        `SELECT i.category AS id, count(*)::int AS count
           FROM items i
           JOIN subscriptions s ON s.feed_id = i.feed_id AND s.user_id = $1
          WHERE i.category IS NOT NULL
          GROUP BY i.category`,
        [userId]
      )
    : await query(
        `SELECT i.category AS id, count(*)::int AS count
           FROM items i JOIN feeds f ON f.id = i.feed_id
          WHERE f.is_public = true AND i.category IS NOT NULL
          GROUP BY i.category`
      );

  const counts = new Map(rows.map((row) => [row.id, row.count]));
  const categories = CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    fa: category.fa,
    count: counts.get(category.id) ?? 0,
  }));
  const other = counts.get('other') ?? 0;
  categories.push({
    id: 'other',
    label: 'Other',
    fa: 'سایر',
    count: other,
  });

  await cacheSet(cacheKey, categories, 30);
  return categories;
}

/* ------------------------------------------------------------ user state */

export async function updateItemState(userId, itemId, { isRead, isFavorite }) {
  const { rows } = await query(
    `INSERT INTO user_items (user_id, item_id, is_read, is_favorite)
     VALUES ($1, $2, COALESCE($3::boolean, false), COALESCE($4::boolean, false))
     ON CONFLICT (user_id, item_id) DO UPDATE
        SET is_read = COALESCE($3::boolean, user_items.is_read),
            is_favorite = COALESCE($4::boolean, user_items.is_favorite),
            updated_at = now()
     RETURNING is_read, is_favorite`,
    [userId, itemId, isRead ?? null, isFavorite ?? null]
  );
  await cacheDel(`user:${userId}:feeds`);
  return rows[0];
}

export async function markAllRead(userId, { feedId = null, filter = 'all' } = {}) {
  const { rowCount } = await query(
    `INSERT INTO user_items (user_id, item_id, is_read)
     SELECT $1, i.id, true
       FROM items i
       JOIN subscriptions s ON s.feed_id = i.feed_id AND s.user_id = $1
       LEFT JOIN user_items ui ON ui.item_id = i.id AND ui.user_id = $1
      WHERE NOT COALESCE(ui.is_read, false)
        AND ($2::uuid IS NULL OR i.feed_id = $2::uuid)
        AND ($3::text <> 'favorite' OR COALESCE(ui.is_favorite, false))
     ON CONFLICT (user_id, item_id) DO UPDATE
        SET is_read = true, updated_at = now()`,
    [userId, feedId, filter]
  );
  await cacheDel(`user:${userId}:feeds`);
  return rowCount;
}

/* ------------------------------------------------------------ public feed */

export async function ensurePublicFeed() {
  const config = useRuntimeConfig();
  const url = config.publicFeedUrl;
  if (!url) return null;

  const { feed } = await findOrCreateFeed(url, { isPublic: true });
  if (!feed) return null;

  if (!feed.is_public) {
    await query('UPDATE feeds SET is_public = true WHERE id = $1', [feed.id]);
  }
  if (!feed.last_fetched_at) {
    await refreshFeed(feed.id, { force: true });
  }
  return feed;
}
