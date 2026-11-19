import { requireUser } from '../utils/auth.js';
import { getIndexStatus, reclassifyAll, reindexAll } from '../utils/indexer.js';

export default defineEventHandler(async (event) => {
  await requireUser(event);
  const body = await readBody(event).catch(() => ({}));

  if (body?.mode === 'categories') {
    const result = await reclassifyAll();
    return { ...(await getIndexStatus()), ...result };
  }
  return await reindexAll();
});
