import { requireUser } from '../../utils/auth.js';
import { removePushSubscription } from '../../utils/push.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const body = (await readBody(event)) ?? {};
  const removed = body.endpoint
    ? await removePushSubscription(user.id, body.endpoint)
    : false;
  return { removed };
});
