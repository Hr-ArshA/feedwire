import { requireAdmin } from '../../utils/auth.js';
import { listAudit } from '../../utils/admin-audit.js';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { limit } = getQuery(event);
  return { entries: await listAudit(Number(limit) || 40) };
});
