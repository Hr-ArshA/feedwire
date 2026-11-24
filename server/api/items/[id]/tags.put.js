import { requireUser } from '../../../utils/auth.js';
import { setItemTags } from '../../../utils/feeds.js';
import { enforceRateLimit } from '../../../utils/limits.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const itemId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid item id', data: { error: 'Invalid item id' } });
  }
  await enforceRateLimit(event, 'tags', 120, 300);
  const body = (await readBody(event)) ?? {};
  const tags = await setItemTags(user.id, itemId, body.tags ?? []);
  return { tags };
});
