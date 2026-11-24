import { requireUser, revokeOtherSessions } from '../../../utils/auth.js';

/**
 * Signs every other device out. `?all=1` also drops the caller's own session,
 * which is the "sign out everywhere" button.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { all } = getQuery(event);
  const includeCurrent = ['1', 'true', 'yes'].includes(
    String(all ?? '').toLowerCase()
  );
  return await revokeOtherSessions(event, user.id, { includeCurrent });
});
