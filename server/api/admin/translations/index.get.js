import { requireAdmin } from '../../../utils/auth.js';
import { listTranslations } from '../../../utils/admin-tools.js';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { q } = getQuery(event);
  return { translations: await listTranslations({ q }) };
});
