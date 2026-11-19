import { requireUser } from '../../utils/auth.js';
import { getStats, listUserFeeds, unsubscribe } from '../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const feedId = getRouterParam(event, 'id');

  const removed = await unsubscribe(user.id, feedId);
  if (!removed) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed not found in your subscriptions',
      data: { error: 'Feed not found in your subscriptions' },
    });
  }

  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);
  return { feeds, stats };
});
