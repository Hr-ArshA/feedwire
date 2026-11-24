import { requireAdmin } from '../../../utils/auth.js';
import { listContentQueue } from '../../../utils/admin-tools.js';

/** Stories whose body failed to download or only produced a summary preview. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { q } = getQuery(event);
  return { items: await listContentQueue({ q }) };
});
