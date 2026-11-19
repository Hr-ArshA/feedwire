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
    const user = await getUserById(cached.userId);
    if (user) return user;
    await cacheDel(`sess:${tokenHash}`);
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, s.expires_at
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

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
  };
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
    'SELECT id, email, display_name FROM users WHERE id = $1',
    [id]
  );
  const row = rows[0];
  return row
    ? { id: row.id, email: row.email, displayName: row.display_name }
    : null;
}

export async function pruneSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
}
