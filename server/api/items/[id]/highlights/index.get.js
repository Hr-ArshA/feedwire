import { requireUser } from '../../../../utils/auth.js';
import { listHighlights } from '../../../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const itemId = Number(getRouterParam(event, 'id'));
  return { highlights: await listHighlights(user.id, itemId) };
});

