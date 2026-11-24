import { requireUser } from '../../utils/auth.js';
import { listPushSubscriptions } from '../../utils/push.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { subscriptions: await listPushSubscriptions(user.id) };
});
