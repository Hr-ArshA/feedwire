import { requireAdmin } from '../../utils/auth.js';
import { getOverview } from '../../utils/admin.js';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return await getOverview();
});
