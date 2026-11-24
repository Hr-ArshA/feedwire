import { requireAdmin } from '../../../utils/auth.js';
import { recordAudit } from '../../../utils/admin-audit.js';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = getRouterParam(event, 'id');

  if (id === admin.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'You cannot delete your own account here',
      data: { error: 'You cannot delete your own account here' },
    });
  }

  const { rows } = await query(
    'DELETE FROM users WHERE id = $1 RETURNING email',
    [id]
  );
  const rowCount = rows.length;
  if (!rowCount) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
      data: { error: 'User not found' },
    });
  }
  await recordAudit(admin, 'user:delete', {
    target: `user:${id}`,
    detail: { email: rows[0].email },
  });
  return { deleted: true };
});
