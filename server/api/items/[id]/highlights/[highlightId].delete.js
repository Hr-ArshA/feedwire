import { requireUser } from '../../../../utils/auth.js';
import { deleteHighlight } from '../../../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const itemId = Number(getRouterParam(event, 'id'));
  const highlightId = Number(getRouterParam(event, 'highlightId'));
  if (!Number.isInteger(highlightId) || highlightId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid highlight id', data: { error: 'Invalid highlight id' } });
  }
  const removed = await deleteHighlight(user.id, itemId, highlightId);
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: 'Highlight not found', data: { error: 'Highlight not found' } });
  }
  return { deleted: true };
});

