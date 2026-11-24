import { listUserSessions, requireUser } from '../../../utils/auth.js';

/** The devices currently signed in to this account. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { sessions: await listUserSessions(event, user.id) };
});
