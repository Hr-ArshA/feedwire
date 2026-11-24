import { requireAdmin } from '../../../../utils/auth.js';
import { refreshFeed } from '../../../../utils/feeds.js';
import { recordAudit } from '../../../../utils/admin-audit.js';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const id = getRouterParam(event, 'id');
  const result = await refreshFeed(id, { force: true });
  await recordAudit(admin, 'feed:refresh', {
    target: `feed:${id}`,
    detail: { inserted: result.inserted ?? 0, error: result.error ?? null },
  });
  return { result };
});
