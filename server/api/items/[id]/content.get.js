import { getSessionUser } from '../../../utils/auth.js';
import { getArticle } from '../../../utils/article-store.js';
import { getItemStats } from '../../../utils/item-stats.js';
import { enforceRateLimit } from '../../../utils/limits.js';

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
  // Cards prefetch on hover, so this limit is generous but still bounded.
  await enforceRateLimit(event, 'content', 150, 600);
  const params = getQuery(event);
  const force = ['1', 'true', 'yes'].includes(
    String(params.force ?? '').toLowerCase()
  );
  // `wait=0` is the SSR fast path: return cached content or a pending shell
  // instead of blocking the HTML response on a publisher download.
  const wait = !['0', 'false', 'no'].includes(
    String(params.wait ?? '').toLowerCase()
  );
  const article = await getArticle(itemId, user?.id ?? null, { force, wait });
  const stats = await getItemStats(itemId, user?.id ?? null).catch(() => null);
  return { ...article, stats };
});
