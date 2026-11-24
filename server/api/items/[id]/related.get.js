import { getSessionUser } from '../../../utils/auth.js';
import { relatedItems } from '../../../utils/item-stats.js';

/**
 * Stories closest to this one in the embedding space. The vectors are already
 * stored for search, so this is one indexed scan and effectively free.
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
  const { limit } = getQuery(event);
  return {
    items: await relatedItems(itemId, user?.id ?? null, Number(limit) || 5),
  };
});
