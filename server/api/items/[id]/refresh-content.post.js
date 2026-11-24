import { getSessionUser } from '../../../utils/auth.js';
import { getArticle } from '../../../utils/article-store.js';
import { enforceRateLimit } from '../../../utils/limits.js';

/**
 * Re-downloads a story, ignoring the cached failure or partial preview. Used by
 * the reader's "Try again" button when a publisher blocked the first attempt.
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
  await enforceRateLimit(event, 'content-refresh', 20, 600);
  return getArticle(itemId, user?.id ?? null, { force: true });
});
