import { getSessionUser } from '../../../utils/auth.js';
import { summarizeItem } from '../../../utils/summarize.js';
import { enforceRateLimit } from '../../../utils/limits.js';

/**
 * Machine summary of a story, produced once and shared by every reader.
 */
export default defineEventHandler(async (event) => {
  const itemId = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid item id',
      data: { error: 'Invalid item id' },
    });
  }

  const user = await getSessionUser(event);
  await enforceRateLimit(event, 'summary', 30, 600);
  const body = (await readBody(event).catch(() => ({}))) ?? {};
  return await summarizeItem(itemId, user?.id ?? null, {
    force: Boolean(body.force),
  });
});
