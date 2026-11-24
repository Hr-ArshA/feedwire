import { requireAdmin } from '../../../utils/auth.js';
import { setUserRole } from '../../../utils/admin.js';
import { recordAudit } from '../../../utils/admin-audit.js';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = getRouterParam(event, 'id');
  const body = await readBody(event).catch(() => ({}));

  if (id === admin.id && body?.role !== 'admin') {
    throw createError({
      statusCode: 400,
      statusMessage: 'You cannot remove your own admin role',
      data: { error: 'You cannot remove your own admin role' },
    });
  }

  const user = await setUserRole(id, String(body?.role ?? ''));
  await recordAudit(admin, `user:role:${user.role}`, {
    target: `user:${id}`,
    detail: { email: user.email },
  });
  return { user };
});
