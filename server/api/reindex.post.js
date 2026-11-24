import { requireUser } from '../utils/auth.js';
import { getIndexStatus, reclassifyAll, reindexAll } from '../utils/indexer.js';
import { enforceRateLimit } from '../utils/limits.js';

export default defineEventHandler(async (event) => {
  await requireUser(event);
  // Wipes and rebuilds vectors for the whole library, so it is heavily capped.
  await enforceRateLimit(event, 'reindex', 3, 3600);
  const body = await readBody(event).catch(() => ({}));

  if (body?.mode === 'categories') {
    const result = await reclassifyAll();
    return { ...(await getIndexStatus()), ...result };
  }
  return await reindexAll();
});
