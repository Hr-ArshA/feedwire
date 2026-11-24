import { createSession, hashPassword, pruneSessions } from '../../utils/auth.js';
import { ensurePublicFeed, subscribe } from '../../utils/feeds.js';
import { clientIp, enforceRateLimit } from '../../utils/limits.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default defineEventHandler(async (event) => {
  // Sign-up is the cheapest way to fill the database, so it is throttled per
  // address as well as per email further down.
  await enforceRateLimit(event, 'register', 5, 3600, `ip:${clientIp(event)}`);

  const body = await readBody(event);
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  const displayName = String(body?.displayName ?? '').trim().slice(0, 60);

  if (!EMAIL_RE.test(email)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Enter a valid email address',
      data: { error: 'Enter a valid email address' },
    });
  }
  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters',
      data: { error: 'Password must be at least 8 characters' },
    });
  }

  const existing = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing.rowCount) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That email is already registered',
      data: { error: 'That email is already registered' },
    });
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, role`,
    [email, passwordHash, displayName || email.split('@')[0]]
  );
  const user = rows[0];

  // Every new account starts with the public feed so the reader is never empty.
  const publicFeed = await ensurePublicFeed();
  if (publicFeed) await subscribe(user.id, publicFeed.id);

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
