import { getPool } from '../utils/db.js';
import { getIndexStatus } from '../utils/indexer.js';
import { queueStats } from '../utils/jobs.js';
import { renderPrometheus } from '../utils/metrics.js';

/**
 * Prometheus scrape endpoint. Aggregate counts only, no personal data. When
 * METRICS_TOKEN is set the caller must send it as a bearer token.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  if (config.metricsToken) {
    const auth = getHeader(event, 'authorization') ?? '';
    if (auth !== 'Bearer ' + config.metricsToken) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }
  }

  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM items) AS items,
       (SELECT count(*)::int FROM feeds) AS feeds,
       (SELECT count(*)::int FROM feeds WHERE last_error IS NOT NULL) AS failing_feeds`
  );
  const index = await getIndexStatus().catch(() => ({}));
  const queue = await queueStats().catch(() => ({}));

  setHeader(event, 'content-type', 'text/plain; version=0.0.4; charset=utf-8');
  return renderPrometheus(
    {
      items: rows[0].items,
      feeds: rows[0].feeds,
      failingFeeds: rows[0].failing_feeds,
      embeddingPending: index.pending ?? 0,
      contentPending: index.contentPending ?? 0,
    },
    queue
  );
});
