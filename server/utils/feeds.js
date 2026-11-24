import { fetchFeed } from './rss.js';
import { normalizeText } from './text.js';
import { embedQuery, CATEGORIES } from './embeddings.js';
import { vectorEnabled } from './db.js';
import { enqueueJob } from './jobs.js';

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
  let value = String(raw ?? '').trim();
  if (!value) throw badRequest('Feed URL is required');

  // People paste "example.com/feed" all the time; assume https.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;

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
    if (inserted > 0) {
      enqueueJob('push', { feedId }).catch(() => {});
    }
    await query(
      `UPDATE feeds
          SET title = COALESCE(NULLIF($2, ''), title),
              site_url = COALESCE($3, site_url),
              last_fetched_at = now(),
              last_attempt_at = now(),
              last_error = NULL,
              fetch_started_at = NULL
        WHERE id = $1`,
      [feedId, parsed.title ?? '', parsed.siteUrl ?? null]
    );
    await cacheDel(`feed:${feedId}`, 'categories:global');
    return { inserted, skipped: false, title: parsed.title, error: null };
  } catch (error) {
    await query(
      `UPDATE feeds
          SET last_error = $2, last_attempt_at = now(), fetch_started_at = NULL
        WHERE id = $1`,
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
  i.reader_count, i.like_count,
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
       COALESCE(ui.is_favorite, false) AS is_favorite,
       COALESCE(ui.is_read_later, false) AS is_read_later`
    : `false AS is_read, false AS is_favorite, false AS is_read_later`;
}

function buildScope({ userId, feedId, filter, category, tag }) {
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
  if (userParam && filter === 'readlater') where.push('COALESCE(ui.is_read_later, false)');
  if (userParam && tag) {
    where.push(
      `EXISTS (SELECT 1 FROM item_tags t
                WHERE t.item_id = i.id AND t.user_id = ${userParam}
                  AND t.tag = ${pb.add(tag)})`
    );
  }

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
    reader_count: Number(row.reader_count ?? 0),
    like_count: Number(row.like_count ?? 0),
    has_content: row.has_content,
    feed_title: row.feed_title,
    feed_url: row.feed_url,
    is_read: row.is_read,
    is_favorite: row.is_favorite,
    is_read_later: row.is_read_later,
  };
}

export async function listItems({
  userId = null,
  feedId = null,
  filter = 'all',
  q = '',
  mode = 'hybrid',
  category = null,
  tag = null,
  limit = 50,
  offset = 0,
}) {
  const text = String(q ?? '').trim();
  if (text) {
    return searchItems({ userId, feedId, filter, q: text, mode, category, tag, limit, offset });
  }

  const scope = buildScope({ userId, feedId, filter, category, tag });
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
  const values = Array.from(vector, (value) => Number(value));
  const limitParam = pb.add(SEARCH_POOL);

  // With pgvector present the HNSW index answers the query; otherwise fall
  // back to a linear dot-product scan over the real[] columns.
  if (vectorEnabled()) {
    const vecParam = pb.add(`[${values.join(',')}]`);
    const sql = `
    SELECT ${ITEM_COLUMNS}, ${scope.columns},
           GREATEST(
             COALESCE(1 - (i.embedding_vec <=> ${vecParam}::vector), -1),
             COALESCE(1 - (i.content_embedding_vec <=> ${vecParam}::vector), -1)
           ) AS score
      FROM items i
      JOIN feeds f ON f.id = i.feed_id
      ${scope.join}
     WHERE ${scope.where}
       AND (i.embedding_vec IS NOT NULL OR i.content_embedding_vec IS NOT NULL)
     ORDER BY score DESC
     LIMIT ${limitParam}`;
    const { rows } = await query(sql, pb.values);
    return rows.map(mapRow);
  }

  const vecParam = pb.add(values);
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

async function searchItems({ userId, feedId, filter, q, mode, category, tag, limit, offset }) {
  const started = Date.now();
  // Each query needs its own parameter list: the keyword and semantic queries
  // run in parallel and would otherwise share (and corrupt) one array.
  const makeScope = () => buildScope({ userId, feedId, filter, category, tag });

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
  observeMetric('search', Date.now() - started);
  incMetric('search_queries');
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
            s.fetch_interval_minutes, s.notify,
            count(i.id)::int AS item_count,
            count(i.id) FILTER (WHERE NOT COALESCE(ui.is_read, false))::int AS unread_count
       FROM subscriptions s
       JOIN feeds f ON f.id = s.feed_id
       LEFT JOIN items i ON i.feed_id = f.id
       LEFT JOIN user_items ui ON ui.item_id = i.id AND ui.user_id = $1
      WHERE s.user_id = $1
      GROUP BY f.id, s.fetch_interval_minutes, s.notify
      ORDER BY f.created_at, f.title`,
    [userId]
  );
  await cacheSet(`user:${userId}:feeds`, rows, 20);
  return rows;
}

/**
 * The scheduler polls a shared feed as often as its most eager subscriber
 * asked for; a user who pauses their subscription (0) never slows others down.
 */
export async function listFeedsDueForRefresh(limit = 3) {
  const { rows } = await query(
    `SELECT f.id, f.title,
            COALESCE(sub.interval_minutes, 30) AS interval_minutes
       FROM feeds f
       LEFT JOIN LATERAL (
         SELECT min(s.fetch_interval_minutes)
                  FILTER (WHERE s.fetch_interval_minutes > 0) AS interval_minutes,
                count(*) FILTER (WHERE s.fetch_interval_minutes > 0)
                  AS active_subscribers
           FROM subscriptions s
          WHERE s.feed_id = f.id
       ) sub ON true
      WHERE (
          COALESCE(sub.active_subscribers, 0) > 0
          OR (f.is_public AND COALESCE(sub.active_subscribers, 0) = 0)
        )
        AND (
          COALESCE(f.last_attempt_at, f.last_fetched_at) IS NULL
          OR COALESCE(f.last_attempt_at, f.last_fetched_at) <= now() - make_interval(
               mins => COALESCE(sub.interval_minutes, 30)
             )
        )
        AND (
          f.fetch_started_at IS NULL
          OR f.fetch_started_at < now() - interval '90 seconds'
        )
      ORDER BY COALESCE(f.last_attempt_at, f.last_fetched_at) NULLS FIRST
      LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function setSubscriptionInterval(userId, feedId, minutes) {
  const { rowCount } = await query(
    `UPDATE subscriptions SET fetch_interval_minutes = $3
      WHERE user_id = $1 AND feed_id = $2`,
    [userId, feedId, minutes]
  );
  if (!rowCount) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed is not in your subscriptions',
      data: { error: 'Feed is not in your subscriptions' },
    });
  }
  await cacheDel(`user:${userId}:feeds`);
}

export async function setSubscriptionNotify(userId, feedId, notify) {
  const { rowCount } = await query(
    `UPDATE subscriptions SET notify = $3
      WHERE user_id = $1 AND feed_id = $2`,
    [userId, feedId, Boolean(notify)]
  );
  if (!rowCount) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed is not in your subscriptions',
      data: { error: 'Feed is not in your subscriptions' },
    });
  }
  await cacheDel(`user:${userId}:feeds`);
}

export async function getStats(userId) {
  if (!userId) {
    const { rows } = await query(
      `SELECT count(*)::int AS total
         FROM items i JOIN feeds f ON f.id = i.feed_id
        WHERE f.is_public = true`
    );
    return {
      total: rows[0].total,
      unread: rows[0].total,
      favorites: 0,
      read_later: 0,
    };
  }

  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE NOT COALESCE(ui.is_read, false))::int AS unread,
            count(*) FILTER (WHERE COALESCE(ui.is_favorite, false))::int AS favorites,
            count(*) FILTER (WHERE COALESCE(ui.is_read_later, false))::int AS read_later
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

export async function updateItemState(
  userId,
  itemId,
  { isRead, isFavorite, isReadLater }
) {
  const { rows } = await query(
    `INSERT INTO user_items (user_id, item_id, is_read, is_favorite, is_read_later)
     VALUES ($1, $2, COALESCE($3::boolean, false), COALESCE($4::boolean, false),
             COALESCE($5::boolean, false))
     ON CONFLICT (user_id, item_id) DO UPDATE
        SET is_read = COALESCE($3::boolean, user_items.is_read),
            is_favorite = COALESCE($4::boolean, user_items.is_favorite),
            is_read_later = COALESCE($5::boolean, user_items.is_read_later),
            updated_at = now()
     RETURNING is_read, is_favorite, is_read_later`,
    [userId, itemId, isRead ?? null, isFavorite ?? null, isReadLater ?? null]
  );
  await cacheDel(`user:${userId}:feeds`);
  return rows[0];
}

/* ------------------------------------------------------- tags & annotations */

function cleanTag(raw) {
  const tag = String(raw ?? '').trim().toLowerCase().slice(0, 40);
  if (!tag) throw badRequest('Tag is required');
  if (!/^[\p{L}\p{N} _-]+$/u.test(tag)) {
    throw badRequest('Tags may contain letters, numbers, spaces, - and _');
  }
  return tag;
}

export async function listItemTags(userId, itemId) {
  const { rows } = await query(
    `SELECT tag FROM item_tags WHERE user_id = $1 AND item_id = $2 ORDER BY tag`,
    [userId, itemId]
  );
  return rows.map((row) => row.tag);
}

export async function setItemTags(userId, itemId, tags) {
  const cleaned = [...new Set((Array.isArray(tags) ? tags : []).map(cleanTag))];
  await withTransaction(async (client) => {
    await client.query(
      'DELETE FROM item_tags WHERE user_id = $1 AND item_id = $2',
      [userId, itemId]
    );
    for (const tag of cleaned) {
      await client.query(
        `INSERT INTO item_tags (user_id, item_id, tag) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [userId, itemId, tag]
      );
    }
  });
  return cleaned;
}

export async function listUserTags(userId) {
  const { rows } = await query(
    `SELECT tag, count(*)::int AS count
       FROM item_tags WHERE user_id = $1
      GROUP BY tag ORDER BY count DESC, tag`,
    [userId]
  );
  return rows;
}

export async function getItemNote(userId, itemId) {
  const { rows } = await query(
    'SELECT note, updated_at FROM item_notes WHERE user_id = $1 AND item_id = $2',
    [userId, itemId]
  );
  return rows[0] ? { note: rows[0].note, updated_at: rows[0].updated_at } : { note: '', updated_at: null };
}

export async function setItemNote(userId, itemId, note) {
  const value = String(note ?? '').slice(0, 20_000);
  if (!value.trim()) {
    await query('DELETE FROM item_notes WHERE user_id = $1 AND item_id = $2', [
      userId,
      itemId,
    ]);
    return { note: '', updated_at: null };
  }
  const { rows } = await query(
    `INSERT INTO item_notes (user_id, item_id, note, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, item_id) DO UPDATE
        SET note = EXCLUDED.note, updated_at = now()
     RETURNING note, updated_at`,
    [userId, itemId, value]
  );
  return rows[0];
}

export async function listHighlights(userId, itemId) {
  const { rows } = await query(
    `SELECT id, quote, note, created_at FROM item_highlights
      WHERE user_id = $1 AND item_id = $2 ORDER BY created_at DESC`,
    [userId, itemId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    quote: row.quote,
    note: row.note,
    created_at: row.created_at,
  }));
}

export async function addHighlight(userId, itemId, { quote, note }) {
  const text = String(quote ?? '').trim().slice(0, 4000);
  if (!text) throw badRequest('A highlight needs a quoted passage');
  const { rows } = await query(
    `INSERT INTO item_highlights (user_id, item_id, quote, note)
     VALUES ($1, $2, $3, $4)
     RETURNING id, quote, note, created_at`,
    [userId, itemId, text, note ? String(note).slice(0, 4000) : null]
  );
  return { ...rows[0], id: Number(rows[0].id) };
}

export async function deleteHighlight(userId, itemId, highlightId) {
  const { rowCount } = await query(
    `DELETE FROM item_highlights
      WHERE id = $1 AND user_id = $2 AND item_id = $3`,
    [highlightId, userId, itemId]
  );
  return rowCount > 0;
}

/** Everything the story page needs about this reader's own annotations. */
export async function getItemExtras(userId, itemId) {
  if (!userId) {
    return {
      tags: [],
      note: '',
      note_updated_at: null,
      highlights: [],
      is_read_later: false,
      is_favorite: false,
    };
  }
  const [tags, note, highlights, state] = await Promise.all([
    listItemTags(userId, itemId),
    getItemNote(userId, itemId),
    listHighlights(userId, itemId),
    query(
      `SELECT is_read_later, is_favorite FROM user_items
        WHERE user_id = $1 AND item_id = $2`,
      [userId, itemId]
    ),
  ]);
  return {
    tags,
    note: note.note,
    note_updated_at: note.updated_at,
    highlights,
    is_read_later: Boolean(state.rows[0]?.is_read_later),
    is_favorite: Boolean(state.rows[0]?.is_favorite),
  };
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

/**
 * Marks every story that sits above `itemId` in the reader order
 * (published_at DESC NULLS LAST, id DESC) as read for this user. Scoped to the
 * caller's subscriptions, so it never touches another reader's state.
 */
export async function markReadAbove(userId, itemId) {
  const { rowCount } = await query(
    `WITH target AS (
       SELECT COALESCE(published_at, '-infinity'::timestamptz) AS at, id
         FROM items
        WHERE id = $2
     )
     INSERT INTO user_items (user_id, item_id, is_read)
     SELECT $1, i.id, true
       FROM items i
       JOIN subscriptions s ON s.feed_id = i.feed_id AND s.user_id = $1
       CROSS JOIN target t
       LEFT JOIN user_items ui ON ui.item_id = i.id AND ui.user_id = $1
      WHERE NOT COALESCE(ui.is_read, false)
        AND (
          COALESCE(i.published_at, '-infinity'::timestamptz) > t.at
          OR (
            COALESCE(i.published_at, '-infinity'::timestamptz) = t.at
            AND i.id > t.id
          )
        )
     ON CONFLICT (user_id, item_id) DO UPDATE
        SET is_read = true, updated_at = now()`,
    [userId, itemId]
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
