import { ensureSchema } from '../utils/db.js';
import { ensurePublicFeed } from '../utils/feeds.js';
import { startIndexer } from '../utils/indexer.js';
import { ensureAdmins } from '../utils/admin.js';
import { startScheduler } from '../utils/scheduler.js';
import { registerJobHandler, startJobWorker } from '../utils/jobs.js';
import { notifyFeedSubscribers } from '../utils/push.js';
import { getArticle } from '../utils/article-store.js';
import { translateItem } from '../utils/translate.js';

function registerJobs() {
  registerJobHandler('push', async ({ feedId }) => {
    const { rows } = await query(
      `SELECT id, title FROM items WHERE feed_id = $1
        ORDER BY fetched_at DESC, id DESC LIMIT 5`,
      [feedId]
    );
    await notifyFeedSubscribers(feedId, rows);
  });
  registerJobHandler('content', async ({ itemId }) => {
    await getArticle(itemId, null, { force: true, wait: true, anyFeed: true });
  });
  registerJobHandler('translate', async ({ itemId, lang }) => {
    const article = await getArticle(itemId, null, { wait: true, anyFeed: true });
    await translateItem(article, lang ?? 'fa');
  });
}

/**
 * Boot sequence: wait for PostgreSQL, create the schema, make sure the public
 * Hacker News feed exists, then start the background embedding worker.
 * The server keeps serving even if the database is briefly unavailable.
 */
export default defineNitroPlugin(() => {
  const boot = async (attempt = 1) => {
    try {
      await ensureSchema();
      await ensurePublicFeed();
      await ensureAdmins().catch((error) =>
        console.warn('[boot] admin bootstrap skipped:', error.message)
      );
      startIndexer();
      if (useRuntimeConfig().schedulerEnabled) startScheduler();
      registerJobs();
      startJobWorker();
      console.log('[boot] database ready, indexer started');
    } catch (error) {
      console.warn(
        `[boot] attempt ${attempt} failed: ${error.message} — retrying in 5s`
      );
      setTimeout(() => boot(attempt + 1), 5000);
    }
  };
  boot();
});
