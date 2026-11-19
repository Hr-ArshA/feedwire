import { requireUser } from '../../utils/auth.js';
import { getStats, listUserFeeds, markAllRead } from '../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readBody(event).catch(() => ({}));

  const changed = await markAllRead(user.id, {
    feedId: body?.feedId ?? null,
    filter: body?.filter === 'favorite' ? 'favorite' : 'all',
  });
  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);
  return { changed, feeds, stats };
});
