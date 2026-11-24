import { requireAdmin } from '../../../../utils/auth.js';
import { recordAudit } from '../../../../utils/admin-audit.js';
import { retryContent } from '../../../../utils/admin-tools.js';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = Number(getRouterParam(event, 'id'));
  const result = await retryContent({ itemId: id });
  await recordAudit(admin, 'content:retry', {
    target: `item:${id}`,
    detail: { ok: result.ok, partial: result.partial, error: result.error },
  });
  return { result };
});
