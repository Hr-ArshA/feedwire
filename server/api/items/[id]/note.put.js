import { requireUser } from '../../../utils/auth.js';
import { setItemNote } from '../../../utils/feeds.js';
import { enforceRateLimit } from '../../../utils/limits.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const itemId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid item id', data: { error: 'Invalid item id' } });
  }
  await enforceRateLimit(event, 'notes', 60, 300);
  const body = (await readBody(event)) ?? {};
  const result = await setItemNote(user.id, itemId, body.note ?? '');
  return { note: result.note, updated_at: result.updated_at };
});
