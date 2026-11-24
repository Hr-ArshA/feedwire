import { requireUser } from '../../utils/auth.js';
import { getStats, updateItemState } from '../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const itemId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid item id',
      data: { error: 'Invalid item id' },
    });
  }

  const body = await readBody(event);
  const state = await updateItemState(user.id, itemId, {
    isRead: typeof body?.isRead === 'boolean' ? body.isRead : null,
    isFavorite: typeof body?.isFavorite === 'boolean' ? body.isFavorite : null,
    isReadLater:
      typeof body?.isReadLater === 'boolean' ? body.isReadLater : null,
  });
  const stats = await getStats(user.id);

  return {
    item: {
      id: itemId,
      is_read: state.is_read,
      is_favorite: state.is_favorite,
      is_read_later: state.is_read_later,
    },
    stats,
  };
});
