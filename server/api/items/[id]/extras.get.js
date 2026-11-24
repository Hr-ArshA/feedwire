import { getSessionUser } from '../../../utils/auth.js';
import { getItemExtras } from '../../../utils/feeds.js';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const itemId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid item id', data: { error: 'Invalid item id' } });
  }
  return await getItemExtras(user?.id ?? null, itemId);
});
