import { unwrapGoogleRedirect } from './google-news.js';
import { getIndexStatus, reindexAll } from './indexer.js';
import { classify } from './embeddings.js';
import { refreshFeed } from './feeds.js';
import { getArticle } from './article-store.js';
import {
  getSchedulerStatus,
  runSchedulerTick,
  startScheduler,
  stopScheduler,
} from './scheduler.js';
import { cacheDelPattern, cacheFlush, cacheKeyCount } from './redis.js';
import { MODEL_ID, EMBEDDING_DIM } from './model.js';

/* ------------------------------------------------------------ job tracker */

function newJob() {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    total: 0,
    done: 0,
    ok: 0,
    failed: 0,
    error: null,
  };
}

const jobs = {
  feedRefresh: newJob(),
  contentRetry: newJob(),
  linkRepair: newJob(),
  reclassify: newJob(),
};

function beginJob(name, total) {
  Object.assign(jobs[name], newJob(), {
    running: true,
    startedAt: new Date().toISOString(),
    total,
  });
}

function finishJob(name, error = null) {
  jobs[name].running = false;
  jobs[name].finishedAt = new Date().toISOString();
  jobs[name].error = error ? String(error.message ?? error).slice(0, 300) : null;
}

export function getJobStatus() {
  return {
    feedRefresh: { ...jobs.feedRefresh },
    contentRetry: { ...jobs.contentRetry },
    linkRepair: { ...jobs.linkRepair },
    reclassify: { ...jobs.reclassify },
  };
}

/* ------------------------------------------------------------ link repair */

const WRAPPED_LINK_SQL = `
  resolved_link ~* 'google\\.[a-z]{2,}(\\.[a-z]{2})?/url\\?'
  OR resolved_link ~* '\\.translate\\.goog'
  OR link ~* 'google\\.[a-z]{2,}(\\.[a-z]{2})?/url\\?'
  OR link ~* '\\.translate\\.goog'`;

/**
 * The publisher URL a story should really point at. Google's `/url?q=` shell is
 * unwrapped; a translate proxy has no recoverable original, so it is dropped
 * and re-resolved the next time the story is opened.
 */
function cleanLink(value) {
  if (!value) return null;
  const unwrapped = unwrapGoogleRedirect(value);
  if (unwrapped) return unwrapped;
  try {
    if (new URL(String(value)).hostname.endsWith('.translate.goog')) return null;
  } catch {
    return null;
  }
  return String(value);
}

export async function countBrokenLinks() {
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE ${WRAPPED_LINK_SQL})::int AS wrapped,
       count(*) FILTER (WHERE coalesce(content_html, '') ILIKE '%Redirect Notice%')::int
         AS notices
     FROM items`
  );
  return { wrapped: rows[0].wrapped, notices: rows[0].notices };
}

/**
 * Heals rows written by older versions: wrapper URLs are unwrapped, proxy URLs
 * cleared, and any body that is really Google's "Redirect Notice" interstitial
 * is dropped so the next read downloads the real page.
 */
export async function repairStoredLinks({ limit = 2000 } = {}) {
  const { rows } = await query(
    `SELECT id, link, resolved_link
       FROM items
      WHERE ${WRAPPED_LINK_SQL}
      LIMIT $1`,
    [limit]
  );

  beginJob('linkRepair', rows.length);
  let repaired = 0;
  for (const row of rows) {
    const next = cleanLink(row.resolved_link || row.link);
    if (next !== row.resolved_link) {
      await query(
        `UPDATE items
            SET resolved_link = $2,
                resolved_link_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END,
                resolved_link_error = NULL
          WHERE id = $1`,
        [row.id, next]
      );
      repaired += 1;
      jobs.linkRepair.ok += 1;
    }
    jobs.linkRepair.done += 1;
  }

  const cleared = await query(
    `UPDATE items
        SET content_html = NULL,
            content_text = NULL,
            content_embedding = NULL,
            content_embedding_model = NULL,
            content_partial = false,
            content_error = NULL,
            content_fetched_at = NULL
      WHERE coalesce(content_html, '') ILIKE '%Redirect Notice%'
      RETURNING id`
  );

  finishJob('linkRepair');
  return { repaired, cleared: cleared.rowCount };
}

/* ---------------------------------------------------------- feed refresh */

/**
 * Force-refreshes feeds in the background. `only` is `all` or `failing`; the
 * response returns immediately and the dashboard polls the job counters.
 */
export async function startFeedRefresh({ only = 'all', limit = 40 } = {}) {
  if (jobs.feedRefresh.running) return { started: false, queued: 0 };

  const { rows } = await query(
    `SELECT f.id, f.title, f.url
       FROM feeds f
      WHERE ($1::text <> 'failing' OR f.last_error IS NOT NULL)
      ORDER BY f.last_attempt_at NULLS FIRST, f.created_at
      LIMIT $2`,
    [only, limit]
  );

  beginJob('feedRefresh', rows.length);
  void (async () => {
    try {
      for (const feed of rows) {
        const result = await refreshFeed(feed.id, { force: true });
        jobs.feedRefresh.done += 1;
        if (result.error) jobs.feedRefresh.failed += 1;
        else jobs.feedRefresh.ok += 1;
      }
      finishJob('feedRefresh');
    } catch (error) {
      jobs.feedRefresh.failed += 1;
      finishJob('feedRefresh', error);
    }
  })();

  return { started: true, queued: rows.length };
}

/* --------------------------------------------------------- content retry */

const RETRYABLE_SQL = `(content_error IS NOT NULL OR content_partial = true)`;

async function resetContent(ids) {
  if (!ids.length) return 0;
  const { rowCount } = await query(
    `UPDATE items
        SET content_html = NULL,
            content_text = NULL,
            content_partial = false,
            content_error = NULL,
            content_fetched_at = NULL,
            content_embedding = NULL,
            content_embedding_model = NULL
      WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  return rowCount;
}

/**
 * Re-downloads stories whose body failed or only produced a summary preview.
 * One story can be retried on its own; otherwise the oldest failures are
 * picked up in a background pass (two at a time, publishers are slow).
 */
export async function retryContent({ itemId = null, limit = 6 } = {}) {
  if (itemId) {
    const id = Number(itemId);
    const reset = await resetContent([id]);
    if (!reset) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Story not found',
        data: { error: 'Story not found' },
      });
    }
    const article = await getArticle(id, null, { force: true, anyFeed: true });
    return {
      itemId: id,
      ok: !article.error,
      partial: Boolean(article.partial),
      error: article.error ?? null,
    };
  }

  if (jobs.contentRetry.running) return { started: false, queued: 0 };

  const { rows } = await query(
    `SELECT id FROM items
      WHERE ${RETRYABLE_SQL}
      ORDER BY content_fetched_at NULLS FIRST
      LIMIT $1`,
    [limit]
  );
  const ids = rows.map((row) => Number(row.id));
  await resetContent(ids);

  beginJob('contentRetry', ids.length);
  void (async () => {
    try {
      const queue = [...ids];
      const worker = async () => {
        while (queue.length) {
          const id = queue.shift();
          const article = await getArticle(id, null, {
            force: true,
            anyFeed: true,
          }).catch((error) => ({ error: error.message }));
          jobs.contentRetry.done += 1;
          if (article.error) jobs.contentRetry.failed += 1;
          else jobs.contentRetry.ok += 1;
        }
      };
      await Promise.all([worker(), worker()]);
      finishJob('contentRetry');
    } catch (error) {
      jobs.contentRetry.failed += 1;
      finishJob('contentRetry', error);
    }
  })();

  return { started: true, queued: ids.length };
}

export async function listContentQueue({ q = '', limit = 60 } = {}) {
  const search = String(q ?? '').trim();
  const { rows } = await query(
    `SELECT i.id, i.title, i.link, i.resolved_link, i.content_error,
            i.content_partial, i.content_fetched_at, f.title AS feed_title
       FROM items i
       JOIN feeds f ON f.id = i.feed_id
      WHERE ${RETRYABLE_SQL}
        AND ($1 = '' OR i.title ILIKE '%' || $1 || '%'
             OR i.content_error ILIKE '%' || $1 || '%')
      ORDER BY i.content_partial DESC, i.content_fetched_at DESC NULLS FIRST
      LIMIT $2`,
    [search, limit]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    title: row.title,
    link: row.resolved_link || row.link,
    error: row.content_error,
    partial: Boolean(row.content_partial),
    fetchedAt: row.content_fetched_at,
    feedTitle: row.feed_title,
  }));
}

/* ----------------------------------------------------------- translations */

export async function listTranslations({ q = '', limit = 60 } = {}) {
  const search = String(q ?? '').trim();
  const { rows } = await query(
    `SELECT t.item_id, t.lang, t.title, t.source, t.error, t.created_at,
            length(coalesce(t.content_text, ''))::int AS chars,
            i.title AS item_title
       FROM translations t
       JOIN items i ON i.id = t.item_id
      WHERE ($1 = '' OR i.title ILIKE '%' || $1 || '%'
             OR t.title ILIKE '%' || $1 || '%')
      ORDER BY t.created_at DESC
      LIMIT $2`,
    [search, limit]
  );
  return rows.map((row) => ({
    itemId: Number(row.item_id),
    lang: row.lang,
    title: row.title || row.item_title,
    itemTitle: row.item_title,
    source: row.source,
    error: row.error,
    chars: row.chars,
    createdAt: row.created_at,
  }));
}

export async function deleteTranslation({ itemId, lang = null }) {
  const { rowCount } = await query(
    `DELETE FROM translations
      WHERE item_id = $1 AND ($2::text IS NULL OR lang = $2)`,
    [Number(itemId), lang]
  );
  return { deleted: rowCount };
}

/* ---------------------------------------------------------- maintenance */

export async function clearCaches() {
  return await cacheFlush();
}

export async function resetEmbeddings() {
  const status = await reindexAll();
  await cacheDelPattern('categories:*');
  return status;
}

/**
 * Re-runs the topic classifier over every embedded story. The whole table is
 * far too slow to sit in a request, so it walks the rows in chunks and updates
 * them in parallel, reporting progress through the job counters.
 */
export async function startReclassify({ chunk = 200, parallel = 25 } = {}) {
  if (jobs.reclassify.running) return { started: false, queued: 0 };

  const { rows: counted } = await query(
    'SELECT count(*)::int AS total FROM items WHERE embedding IS NOT NULL'
  );
  beginJob('reclassify', counted[0].total);

  void (async () => {
    try {
      let lastId = 0;
      for (;;) {
        const { rows } = await query(
          `SELECT id, title, summary, embedding
             FROM items
            WHERE embedding IS NOT NULL AND id > $1
            ORDER BY id
            LIMIT $2`,
          [lastId, chunk]
        );
        if (!rows.length) break;

        for (let index = 0; index < rows.length; index += parallel) {
          const slice = rows.slice(index, index + parallel);
          await Promise.all(
            slice.map(async (row) => {
              const { category, score, source } = await classify(
                row.embedding,
                row.title,
                row.summary
              );
              await query(
                `UPDATE items
                    SET category = $2, category_score = $3, category_source = $4
                  WHERE id = $1`,
                [row.id, category, score, source]
              );
              jobs.reclassify.done += 1;
              jobs.reclassify.ok += 1;
            })
          );
        }
        lastId = rows[rows.length - 1].id;
      }

      await cacheDelPattern('categories:*');
      await cacheDelPattern('user:*:categories');
      finishJob('reclassify');
    } catch (error) {
      finishJob('reclassify', error);
    }
  })();

  return { started: true, queued: jobs.reclassify.total };
}

export async function setSchedulerEnabled(enabled) {
  if (enabled) startScheduler();
  else stopScheduler();
  return getSchedulerStatus();
}

export async function runSchedulerNow() {
  const result = await runSchedulerTick();
  return { ...result, scheduler: getSchedulerStatus() };
}

/* --------------------------------------------------------------- system */

export async function getSystemInfo() {
  const [db, cacheKeys] = await Promise.all([
    query(
      `SELECT pg_database_size(current_database())::bigint AS size,
              count(*)::int AS tables
         FROM information_schema.tables
        WHERE table_schema = 'public'`
    ).catch(() => null),
    cacheKeyCount(),
  ]);

  return {
    node: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    model: MODEL_ID,
    dimensions: EMBEDDING_DIM,
    cache: cacheKeys === null ? 'down' : 'up',
    cacheKeys: cacheKeys ?? 0,
    dbSizeBytes: db ? Number(db.rows[0].size) : null,
    tables: db ? db.rows[0].tables : null,
    siteUrl: useRuntimeConfig().public.siteUrl ?? null,
  };
}
