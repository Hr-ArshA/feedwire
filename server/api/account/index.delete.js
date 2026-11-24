import {
  SESSION_COOKIE,
  requireUser,
  verifyPassword,
} from '../../utils/auth.js';
import { cacheDelPattern } from '../../utils/redis.js';
import { enforceRateLimit } from '../../utils/limits.js';

/**
 * Self-service account deletion. The password has to be re-entered, and the
 * last remaining admin cannot delete themselves out of the system.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await enforceRateLimit(event, 'account-delete', 5, 3600);

  const body = (await readBody(event).catch(() => ({}))) ?? {};
  const password = String(body.password ?? '');

  if (String(body.confirm ?? '').trim().toUpperCase() !== 'DELETE') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Type DELETE to confirm',
      data: { error: 'Type DELETE to confirm' },
    });
  }

  const { rows } = await query(
    'SELECT password_hash, role FROM users WHERE id = $1',
    [user.id]
  );
  const account = rows[0];
  if (!account) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Account not found',
      data: { error: 'Account not found' },
    });
  }

  if (!(await verifyPassword(password, account.password_hash))) {
    throw createError({
      statusCode: 401,
      statusMessage: 'That password is not correct',
      data: { error: 'That password is not correct' },
    });
  }

  if (account.role === 'admin') {
    const { rows: admins } = await query(
      `SELECT count(*)::int AS total FROM users WHERE role = 'admin'`
    );
    if (admins[0].total <= 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'The last admin cannot delete their account here',
        data: {
          error:
            'You are the last admin. Promote another account before deleting this one.',
        },
      });
    }
  }

  await query('DELETE FROM users WHERE id = $1', [user.id]);
  await cacheDelPattern(`user:${user.id}:*`);
  deleteCookie(event, SESSION_COOKIE, { path: '/' });
  return { deleted: true };
});
