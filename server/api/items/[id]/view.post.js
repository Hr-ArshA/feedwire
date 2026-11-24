import { getSessionUser } from '../../../utils/auth.js';
import { recordView } from '../../../utils/item-stats.js';
import { enforceRateLimit } from '../../../utils/limits.js';

/**
 * Records that a reader opened this story in the app. One row per person, so
 * the counter answers "how many people read this here" rather than page views.
 */
export default defineEventHandler(async (event) => {
  const itemId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid item id',
      data: { error: 'Invalid item id' },
    });
  }

  const user = await getSessionUser(event);
  await enforceRateLimit(event, 'view', 240, 600);
  const stats = await recordView(itemId, user?.id ?? null);
  return { stats };
});
