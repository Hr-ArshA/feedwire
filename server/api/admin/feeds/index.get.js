import { requireAdmin } from '../../../utils/auth.js';
import { listFeeds } from '../../../utils/admin.js';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { q } = getQuery(event);
  return { feeds: await listFeeds(q) };
});
