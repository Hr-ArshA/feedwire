import { requireAdmin } from '../../../utils/auth.js';
import { recordAudit } from '../../../utils/admin-audit.js';
import { deleteTranslation } from '../../../utils/admin-tools.js';

/**
 * Drops one cached translation (or every language for a story) so the next
 * reader who asks for it regenerates it against the current article text.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = (await readBody(event).catch(() => ({}))) ?? {};
  const itemId = Number(body.itemId);

  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A story id is required',
      data: { error: 'A story id is required' },
    });
  }

  const result = await deleteTranslation({
    itemId,
    lang: body.lang ? String(body.lang) : null,
  });
  await recordAudit(admin, 'translation:delete', {
    target: `item:${itemId}`,
    detail: { lang: body.lang ?? 'all', deleted: result.deleted },
  });
  return result;
});
