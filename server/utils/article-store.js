import { extractArticle } from './article.js';
import {
  isGoogleNewsUrl,
  resolveGoogleNewsUrl,
  unwrapGoogleRedirect,
} from './google-news.js';

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
const ITEM_COLUMNS = `i.id, i.title, i.link, i.resolved_link, i.author, i.summary,
         i.published_at, i.fetched_at,
         i.category,
         i.content_html, i.content_text, i.content_fetched_at, i.content_error,
         i.content_partial,
         (i.content_embedding IS NOT NULL) AS content_indexed,
         f.id AS feed_id, f.title AS feed_title, f.is_public`;

/** Readers only see public feeds and their own subscriptions. */
const ITEM_SQL = `
  SELECT ${ITEM_COLUMNS}
    FROM items i
    JOIN feeds f ON f.id = i.feed_id
   WHERE i.id = $1
     AND (f.is_public = true
          OR ($2::uuid IS NOT NULL AND EXISTS (
                SELECT 1 FROM subscriptions s
                 WHERE s.feed_id = i.feed_id AND s.user_id = $2::uuid)))`;

/** Operators can read any story, including feeds nobody subscribes to. */
const ITEM_SQL_ANY = `
  SELECT ${ITEM_COLUMNS}
    FROM items i
    JOIN feeds f ON f.id = i.feed_id
   WHERE i.id = $1`;

async function loadItem(itemId, userId, anyFeed = false) {
  const { rows } = anyFeed
    ? await query(ITEM_SQL_ANY, [itemId])
    : await query(ITEM_SQL, [itemId, userId ?? null]);
  const row = rows[0];
  if (!row) throw notFound();
  return cleanResolvedLink(row);
}

/**
 * Early versions stored Google's `google.com/url?q=…` wrapper as the resolved
 * link; that URL serves a "Redirect Notice" page, so readers saw the notice
 * text as the story. Unwrap it once and persist the repair.
 */
async function cleanResolvedLink(row) {
  if (!row.resolved_link) return row;
  const fixed = storyUrl(row.resolved_link);
  if (fixed === row.resolved_link) return row;
  await query(
    'UPDATE items SET resolved_link = $2, resolved_link_at = now() WHERE id = $1',
    [row.id, fixed]
  ).catch(() => {});
  return { ...row, resolved_link: fixed };
}

/**
 * The URL a reader should see as "the original": never a Google redirect
 * wrapper and never the translate proxy we may have read the page through.
 * Returns null for a value that cannot be used.
 */
function storyUrl(value) {
  if (!value) return null;
  const unwrapped = unwrapGoogleRedirect(value) ?? String(value);
  try {
    const host = new URL(unwrapped).hostname;
    if (host.endsWith('.translate.goog')) return null;
  } catch {
    return null;
  }
  return unwrapped;
}

function shape(row) {
  return {
    id: Number(row.id),
    title: row.title,
    link: row.link,
    resolved_link: row.resolved_link ?? null,
    author: row.author,
    summary: row.summary,
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    category: row.category,
    feed_id: row.feed_id,
    feed_title: row.feed_title,
    is_public: row.is_public,
    content_indexed: row.content_indexed,
    content_fetched_at: row.content_fetched_at,
    html: row.content_html,
    text: row.content_text,
    error: row.content_error,
    partial: Boolean(row.content_partial),
    pending: false,
  };
}

function retryable(row) {
  if (!row.content_fetched_at) return true;
  return Date.now() - new Date(row.content_fetched_at).getTime() > RETRY_AFTER_MS;
}

async function waitForContent(itemId, userId, anyFeed = false) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const row = await loadItem(itemId, userId, anyFeed);
    if (row.content_html || row.content_error) return row;
  }
  return loadItem(itemId, userId, anyFeed);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Publishers that block bots still give us their RSS summary. Rather than show
 * an empty screen, store the summary as a clearly-labelled preview.
 */
function previewFromSummary(row) {
  const summary = String(row.summary ?? '').trim();
  if (summary.length < 40) return null;
  const link = row.resolved_link || row.link;
  const host = (() => {
    try {
      return new URL(link).hostname.replace(/^www\./, '');
    } catch {
      return 'the publisher';
    }
  })();
  const html =
    `<p>${escapeHtml(summary)}</p>` +
    (link
      ? `<p><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Continue reading on ${escapeHtml(host)}</a></p>`
      : '');
  return { html, text: summary, finalUrl: link ?? null };
}

export async function getArticle(
  itemId,
  userId = null,
  { force = false, wait = true, anyFeed = false } = {}
) {
  let row = await loadItem(itemId, userId, anyFeed);
  if (!force && row.content_html) return shape(row);
  if (!force && row.content_error && !retryable(row)) return shape(row);
  if (!row.link) throw badRequest('This story has no link to read');

  // The page shell must paint immediately: when the body is not cached yet we
  // answer with the headline/summary and let the client ask for the body.
  if (!wait) return { ...shape(row), pending: true };

  if (force) {
    await query(
      `UPDATE items
          SET content_html = NULL,
              content_text = NULL,
              content_partial = false,
              content_error = NULL,
              content_fetched_at = NULL,
              content_embedding = NULL,
              content_embedding_model = NULL,
              resolved_link = CASE WHEN resolved_link_error IS NULL THEN resolved_link ELSE NULL END,
              resolved_link_error = NULL
        WHERE id = $1`,
      [itemId]
    );
    row = await loadItem(itemId, userId, anyFeed);
  }

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
    row = await waitForContent(itemId, userId, anyFeed);
    return shape(row);
  }

  try {
    const startedAt = Date.now();
    let target = row.resolved_link || row.link;
    const fromGoogleNews = isGoogleNewsUrl(row.link);
    if (!row.resolved_link && isGoogleNewsUrl(row.link)) {
      const resolved = await resolveGoogleNewsUrl(row.link);
      await query(
        `UPDATE items
            SET resolved_link = $2, resolved_link_at = now(), resolved_link_error = NULL
          WHERE id = $1`,
        [itemId, resolved]
      );
      target = resolved;
    }

    const article = await extractArticle(target, {
      referer: fromGoogleNews ? 'https://news.google.com/' : undefined,
    });
    observeMetric('content_extract', Date.now() - startedAt);
    incMetric('content_extracted');
    // Never persist a Google redirect wrapper as the story's real URL.
    const finalUrl = storyUrl(article.finalUrl);
    await query(
      `UPDATE items
          SET content_html = $2,
              content_text = $3,
              content_fetched_at = now(),
              content_error = NULL,
              content_partial = false,
              resolved_link = COALESCE(resolved_link, $4)
        WHERE id = $1`,
      [itemId, article.html, article.text, finalUrl]
    );
    row = await loadItem(itemId, userId, anyFeed);
    return shape(row);
  } catch (error) {
    const message = String(error?.message ?? 'Could not load that page').slice(0, 500);
    const preview = previewFromSummary(row);

    if (preview) {
      await query(
        `UPDATE items
            SET content_html = $2,
                content_text = $3,
                content_partial = true,
                content_error = $4,
                content_fetched_at = now()
          WHERE id = $1`,
        [itemId, preview.html, preview.text, message]
      );
      row = await loadItem(itemId, userId, anyFeed);
      return shape(row);
    }

    await query(
      `UPDATE items
          SET content_error = $2,
              content_fetched_at = now(),
              content_partial = false,
              resolved_link_error = CASE
                WHEN resolved_link IS NULL AND $3::boolean THEN $2
                ELSE resolved_link_error
              END
        WHERE id = $1`,
      [itemId, message, isGoogleNewsUrl(row.link)]
    );
    row = await loadItem(itemId, userId, anyFeed);
    return shape(row);
  }
}
