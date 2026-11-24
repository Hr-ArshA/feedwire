import { requireAdmin } from '../../../utils/auth.js';
import { listUsers } from '../../../utils/admin.js';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { q } = getQuery(event);
  return { users: await listUsers(q) };
});
