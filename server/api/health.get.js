import { query } from '../utils/db.js';

/**
 * Liveness probe used by Docker Compose. Reports 503 until PostgreSQL answers.
 */
export default defineEventHandler(async (event) => {
  try {
    await query('SELECT 1');
    return { ok: true, db: 'up' };
  } catch {
    setResponseStatus(event, 503);
    return { ok: false, db: 'down' };
  }
});
