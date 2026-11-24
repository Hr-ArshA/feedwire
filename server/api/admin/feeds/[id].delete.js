import { requireAdmin } from '../../../utils/auth.js';
import { recordAudit } from '../../../utils/admin-audit.js';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = getRouterParam(event, 'id');

  const { rows } = await query('SELECT is_public FROM feeds WHERE id = $1', [id]);
  if (!rows[0]) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed not found',
      data: { error: 'Feed not found' },
    });
  }
  if (rows[0].is_public) {
    throw createError({
      statusCode: 400,
      statusMessage: 'The public feed cannot be deleted',
      data: { error: 'The public feed cannot be deleted' },
    });
  }

  const removed = await query(
    'DELETE FROM feeds WHERE id = $1 RETURNING title, url',
    [id]
  );
  await cacheDel('categories:global');
  await recordAudit(admin, 'feed:delete', {
    target: `feed:${id}`,
    detail: { url: removed.rows[0]?.url ?? null, title: removed.rows[0]?.title ?? null },
  });
  return { deleted: true };
});
