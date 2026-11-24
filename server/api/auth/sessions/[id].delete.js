import { requireUser, revokeSession } from '../../../utils/auth.js';

/** Signs one device out by session id. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const id = getRouterParam(event, 'id');
  const revoked = await revokeSession(user.id, id);
  if (!revoked) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Session not found',
      data: { error: 'Session not found' },
    });
  }
  return { revoked: true };
});
