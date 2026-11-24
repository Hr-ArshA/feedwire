import { requireUser } from '../../utils/auth.js';
import { savePushSubscription } from '../../utils/push.js';
import { enforceRateLimit } from '../../utils/limits.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await enforceRateLimit(event, 'push-subscribe', 30, 600);
  const body = (await readBody(event)) ?? {};
  await savePushSubscription(user.id, body.subscription, getHeader(event, 'user-agent'));
  return { subscribed: true };
});
