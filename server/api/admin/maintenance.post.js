import { requireAdmin } from '../../utils/auth.js';
import { recordAudit } from '../../utils/admin-audit.js';
import {
  clearCaches,
  repairStoredLinks,
  resetEmbeddings,
  retryContent,
  startFeedRefresh,
  startReclassify,
} from '../../utils/admin-tools.js';

const ACTIONS = new Set([
  'reindex',
  'reclassify',
  'repair-links',
  'clear-cache',
  'refresh-feeds',
  'retry-content',
  'prune-sessions',
]);

/**
 * One endpoint for every operator maintenance action so the dashboard needs a
 * single `$fetch` call per button. Everything here is idempotent and safe to
 * press twice.
 */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = (await readBody(event).catch(() => ({}))) ?? {};
  const action = String(body.action ?? '');

  if (!ACTIONS.has(action)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unknown maintenance action',
      data: { error: 'Unknown maintenance action' },
    });
  }

  let result;
  switch (action) {
    case 'reindex':
      result = await resetEmbeddings();
      break;
    case 'reclassify':
      result = await startReclassify();
      break;
    case 'repair-links':
      result = await repairStoredLinks();
      break;
    case 'clear-cache':
      result = await clearCaches();
      break;
    case 'refresh-feeds':
      result = await startFeedRefresh({
        only: body.only === 'failing' ? 'failing' : 'all',
      });
      break;
    case 'retry-content':
      result = await retryContent({ limit: 6 });
      break;
    case 'prune-sessions':
      await pruneSessions();
      await prunePasswordResets();
      result = { pruned: true };
      break;
    default:
      result = { skipped: true };
  }

  await recordAudit(admin, `maintenance:${action}`, {
    detail: body.only ? { only: body.only } : null,
  });

  return { action, result };
});
