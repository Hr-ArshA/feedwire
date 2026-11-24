import {
  consumePasswordReset,
  createSession,
  pruneSessions,
  updatePassword,
} from '../../utils/auth.js';
import { rateLimit } from '../../utils/redis.js';

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const token = String(body?.token ?? '').trim();
  const password = String(body?.password ?? '');

  const ip =
    getRequestIP(event, { xForwardedFor: true }) ??
    event.node.req.socket.remoteAddress ??
    'unknown';
  const limit = await rateLimit(`reset:${ip}`, 10, 900);
  if (!limit.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many attempts. Try again later.',
      data: { error: 'Too many attempts. Try again later.' },
    });
  }

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters',
      data: { error: 'Password must be at least 8 characters' },
    });
  }

  const userId = await consumePasswordReset(token);
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'This reset link is invalid or has expired',
      data: { error: 'This reset link is invalid or has expired' },
    });
  }

  await updatePassword(userId, password);
  await createSession(event, userId);
  pruneSessions();

  return { ok: true };
});
