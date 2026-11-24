import { requireAdmin } from '../../utils/auth.js';
import { recordAudit } from '../../utils/admin-audit.js';
import { runSchedulerNow, setSchedulerEnabled } from '../../utils/admin-tools.js';

/**
 * Pauses or resumes the background feed poller, or triggers a single pass
 * immediately. Used by the Overview tab.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = (await readBody(event).catch(() => ({}))) ?? {};
  const action = String(body.action ?? '');

  if (action === 'run') {
    const result = await runSchedulerNow();
    await recordAudit(admin, 'scheduler:run', {
      detail: { refreshed: result.refreshed, inserted: result.inserted },
    });
    return result;
  }

  if (action === 'pause' || action === 'resume') {
    const scheduler = await setSchedulerEnabled(action === 'resume');
    await recordAudit(admin, `scheduler:${action}`, {
      detail: { enabled: scheduler.enabled },
    });
    return { scheduler };
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Unknown scheduler action',
    data: { error: 'Unknown scheduler action' },
  });
});
