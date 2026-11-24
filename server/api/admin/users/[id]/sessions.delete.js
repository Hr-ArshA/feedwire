import { requireAdmin } from '../../../../utils/auth.js';
import { recordAudit } from '../../../../utils/admin-audit.js';
import { revokeUserSessions } from '../../../../utils/admin.js';

/** Signs an account out everywhere; the next request has to log in again. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = getRouterParam(event, 'id');
  const result = await revokeUserSessions(id);
  await recordAudit(admin, 'user:revoke-sessions', {
    target: `user:${id}`,
    detail: { revoked: result.revoked },
  });
  return result;
});
