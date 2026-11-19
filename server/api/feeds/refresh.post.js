import { requireUser } from '../../utils/auth.js';
import { getStats, listUserFeeds, refreshUserFeeds } from '../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);

  const results = await refreshUserFeeds(user.id);
  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);
  return { results, feeds, stats };
});
