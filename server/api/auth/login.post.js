import { createSession, pruneSessions, verifyPassword } from '../../utils/auth.js';
import { rateLimit } from '../../utils/redis.js';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  const ip =
    getRequestIP(event, { xForwardedFor: true }) ?? event.node.req.socket.remoteAddress ?? 'unknown';
  const limit = await rateLimit(`login:${ip}:${email}`, 10, 300);
  if (!limit.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many attempts. Try again in a few minutes.',
      data: { error: 'Too many attempts. Try again in a few minutes.' },
    });
  }

  const { rows } = await query(
    'SELECT id, email, display_name, role, password_hash FROM users WHERE email = $1',
    [email]
  );
  const user = rows[0];

  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!valid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Wrong email or password',
      data: { error: 'Wrong email or password' },
    });
  }

  await createSession(event, user.id);
  pruneSessions();

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
    },
  };
});
