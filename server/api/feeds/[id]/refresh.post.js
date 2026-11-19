import { requireUser } from '../../../utils/auth.js';
import {
  getStats,
  isSubscribed,
  listUserFeeds,
  refreshFeed,
} from '../../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const feedId = getRouterParam(event, 'id');

  if (!(await isSubscribed(user.id, feedId))) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Feed not found in your subscriptions',
      data: { error: 'Feed not found in your subscriptions' },
    });
  }

  const result = await refreshFeed(feedId, { force: true });
  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);
  return { result, feeds, stats };
});
