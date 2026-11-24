import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE = 'fw_session';
const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function createSession(event, userId) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, event.node.req.headers['user-agent'] ?? null, expiresAt]
  );

  setCookie(event, SESSION_COOKIE, token, cookieOptions());
  await cacheSet(
    `sess:${tokenHash}`,
    { userId },
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );
  return token;
}

export async function getSessionUser(event) {
  const token = getCookie(event, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const cached = await cacheGet(`sess:${tokenHash}`);
  if (cached?.userId) {
    touchSession(tokenHash);
    const user = await getUserById(cached.userId);
    if (user) return user;
    await cacheDel(`sess:${tokenHash}`);
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.role, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return null;

  const ttl = Math.max(
    1,
    Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000)
  );
  await cacheSet(`sess:${tokenHash}`, { userId: row.id }, ttl);
  touchSession(tokenHash);

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

/**
 * Records that a device used its session. Throttled to once every five minutes
 * so a busy reader does not turn every request into a write.
 */
function touchSession(tokenHash) {
  query(
    `UPDATE sessions SET last_seen_at = now()
      WHERE token_hash = $1
        AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes')`,
    [tokenHash]
  ).catch(() => {});
}

/** The hash of the session cookie on this request, or null. */
export function currentSessionHash(event) {
  const token = getCookie(event, SESSION_COOKIE);
  return token ? hashToken(token) : null;
}

/**
 * Every live session of one account, newest activity first. The caller's own
 * session is flagged so the UI can label it "this device".
 */
export async function listUserSessions(event, userId) {
  const current = currentSessionHash(event);
  const { rows } = await query(
    `SELECT id, token_hash, user_agent, created_at, last_seen_at, expires_at
       FROM sessions
      WHERE user_id = $1 AND expires_at > now()
      ORDER BY COALESCE(last_seen_at, created_at) DESC, created_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    current: row.token_hash === current,
  }));
}

export async function revokeSession(userId, sessionId) {
  const { rows } = await query(
    `DELETE FROM sessions WHERE id = $1 AND user_id = $2
     RETURNING token_hash`,
    [sessionId, userId]
  );
  if (rows[0]) await cacheDel(`sess:${rows[0].token_hash}`);
  return rows.length > 0;
}

/**
 * Signs the account out on every other device. With `includeCurrent` the
 * caller's own session goes too, which is what "sign out everywhere" means.
 */
export async function revokeOtherSessions(
  event,
  userId,
  { includeCurrent = false } = {}
) {
  const current = currentSessionHash(event);
  const { rows } = await query(
    `DELETE FROM sessions
      WHERE user_id = $1
        AND ($2::boolean OR token_hash <> $3::text)
      RETURNING token_hash`,
    [userId, includeCurrent, current ?? '']
  );
  await cacheDel(...rows.map((row) => `sess:${row.token_hash}`));
  if (includeCurrent) {
    deleteCookie(event, SESSION_COOKIE, { path: '/' });
  }
  return { revoked: rows.length };
}

export async function requireUser(event) {
  const user = await getSessionUser(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
      data: { error: 'Authentication required' },
    });
  }
  return user;
}

export async function requireAdmin(event) {
  const user = await requireUser(event);
  if (user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access required',
      data: { error: 'Admin access required' },
    });
  }
  return user;
}

export async function destroySession(event) {
  const token = getCookie(event, SESSION_COOKIE);
  if (token) {
    const tokenHash = hashToken(token);
    await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]).catch(
      () => {}
    );
    await cacheDel(`sess:${tokenHash}`);
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' });
}

async function getUserById(id) {
  const { rows } = await query(
    'SELECT id, email, display_name, role FROM users WHERE id = $1',
    [id]
  );
  const row = rows[0];
  return row
    ? {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
      }
    : null;
}

export async function pruneSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
}

/* ------------------------------------------------------- password resets */

const RESET_MINUTES = 60;

/**
 * Issues a single-use reset token. Any older token for the same account is
 * dropped, so only the newest email can be used.
 */
export async function createPasswordReset(userId) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await query(
    `DELETE FROM password_resets
      WHERE user_id = $1 OR expires_at < now()`,
    [userId]
  );
  await query(
    `INSERT INTO password_resets (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3::int * interval '1 minute'))`,
    [tokenHash, userId, RESET_MINUTES]
  );
  return token;
}

/** Returns the user id for a valid, unexpired token and burns it. */
export async function consumePasswordReset(token) {
  const value = String(token ?? '').trim();
  if (!value) return null;
  const tokenHash = hashToken(value);
  const { rows } = await query(
    `SELECT user_id FROM password_resets
      WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return null;
  await query('DELETE FROM password_resets WHERE token_hash = $1', [tokenHash]);
  return row.user_id;
}

/**
 * Replaces the password and signs every existing session out. Cached session
 * entries are evicted too, otherwise the Redis copy would outlive the row.
 */
export async function updatePassword(userId, password) {
  const passwordHash = await hashPassword(password);
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [
    userId,
    passwordHash,
  ]);
  const { rows } = await query(
    'SELECT token_hash FROM sessions WHERE user_id = $1',
    [userId]
  );
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await cacheDel(...rows.map((row) => `sess:${row.token_hash}`));
}

export async function prunePasswordResets() {
  await query('DELETE FROM password_resets WHERE expires_at < now()').catch(
    () => {}
  );
}
