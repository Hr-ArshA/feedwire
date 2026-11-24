import { requireUser } from '../../utils/auth.js';
import { sendToUser } from '../../utils/push.js';
import { enforceRateLimit } from '../../utils/limits.js';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await enforceRateLimit(event, 'push-test', 6, 600);
  const sent = await sendToUser(user.id, {
    title: 'Feedwire',
    body: 'Push notifications are working on this device.',
    url: '/reader',
    tag: 'test',
  });
  return { sent };
});
