import { ensureSchema } from '../utils/db.js';
import { ensurePublicFeed } from '../utils/feeds.js';
import { startIndexer } from '../utils/indexer.js';

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
      startIndexer();
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
