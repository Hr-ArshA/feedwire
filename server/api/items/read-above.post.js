import { requireUser } from '../../utils/auth.js';
import {
  getStats,
  listUserFeeds,
  markReadAbove,
} from '../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = await readBody(event).catch(() => ({}));
  const itemId = Number(body?.itemId);

  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid item id',
      data: { error: 'Invalid item id' },
    });
  }

  const changed = await markReadAbove(user.id, itemId);
  const [feeds, stats] = await Promise.all([
    listUserFeeds(user.id),
    getStats(user.id),
  ]);
  return { changed, feeds, stats };
});
