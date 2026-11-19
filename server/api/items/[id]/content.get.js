import { getSessionUser } from '../../../utils/auth.js';
import { getArticle } from '../../../utils/article-store.js';

/**
 * Reader view for a single story. The first call downloads and extracts the
 * page (and queues it for body embedding); later calls are served from the
 * shared `items.content_*` columns.
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
  return getArticle(itemId, user?.id ?? null);
});
