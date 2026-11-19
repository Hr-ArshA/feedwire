import { extractArticle } from './article.js';

const RETRY_AFTER_MS = 60 * 60 * 1000;
const LOCK_WAIT_MS = 25_000;
const POLL_MS = 600;

function notFound() {
  return createError({
    statusCode: 404,
    statusMessage: 'Story not found',
    data: { error: 'Story not found' },
  });
}

function badRequest(message) {
  return createError({ statusCode: 400, statusMessage: message, data: { error: message } });
}

/**
 * A story is readable when its feed is public or the caller subscribes to it.
 * The extracted article itself lives on `items`, so it is fetched and embedded
 * exactly once no matter how many users open the same link.
 */
const ITEM_SQL = `
  SELECT i.id, i.title, i.link, i.author, i.summary, i.published_at, i.fetched_at,
         i.category,
         i.content_html, i.content_text, i.content_fetched_at, i.content_error,
         (i.content_embedding IS NOT NULL) AS content_indexed,
         f.id AS feed_id, f.title AS feed_title, f.is_public
    FROM items i
    JOIN feeds f ON f.id = i.feed_id
   WHERE i.id = $1
     AND (f.is_public = true
          OR ($2::uuid IS NOT NULL AND EXISTS (
                SELECT 1 FROM subscriptions s
                 WHERE s.feed_id = i.feed_id AND s.user_id = $2::uuid)))`;

async function loadItem(itemId, userId) {
  const { rows } = await query(ITEM_SQL, [itemId, userId ?? null]);
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

function shape(row) {
  return {
    id: Number(row.id),
    title: row.title,
    link: row.link,
    author: row.author,
    summary: row.summary,
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    category: row.category,
    feed_id: row.feed_id,
    feed_title: row.feed_title,
    is_public: row.is_public,
    content_indexed: row.content_indexed,
    fetched_at: row.content_fetched_at,
    html: row.content_html,
    text: row.content_text,
    error: row.content_error,
  };
}

function retryable(row) {
  if (!row.content_fetched_at) return true;
  return Date.now() - new Date(row.content_fetched_at).getTime() > RETRY_AFTER_MS;
}

async function waitForContent(itemId, userId) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const row = await loadItem(itemId, userId);
    if (row.content_html || row.content_error) return row;
  }
  return loadItem(itemId, userId);
}

export async function getArticle(itemId, userId = null) {
  let row = await loadItem(itemId, userId);
  if (row.content_html) return shape(row);
  if (row.content_error && !retryable(row)) return shape(row);
  if (!row.link) throw badRequest('This story has no link to read');

  // Single-flight: only the first request for a story downloads it; everyone
  // else waits for that download instead of hammering the origin site.
  const lock = await query(
    `UPDATE items SET content_fetched_at = now()
      WHERE id = $1
        AND (content_fetched_at IS NULL
             OR (content_html IS NULL
                 AND content_fetched_at < now() - interval '1 hour'))
      RETURNING id`,
    [itemId]
  );

  if (!lock.rowCount) {
    row = await waitForContent(itemId, userId);
    return shape(row);
  }

  try {
    const article = await extractArticle(row.link);
    await query(
      `UPDATE items
          SET content_html = $2,
              content_text = $3,
              content_fetched_at = now(),
              content_error = NULL
        WHERE id = $1`,
      [itemId, article.html, article.text]
    );
    row = await loadItem(itemId, userId);
    return shape(row);
  } catch (error) {
    const message = String(error?.message ?? 'Could not load that page').slice(0, 500);
    await query(
      `UPDATE items SET content_error = $2, content_fetched_at = now() WHERE id = $1`,
      [itemId, message]
    );
    row = await loadItem(itemId, userId);
    return shape(row);
  }
}
