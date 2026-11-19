import { requireUser } from '../../utils/auth.js';
import { getStats, listUserFeeds } from '../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);
  return { feeds, stats };
});
