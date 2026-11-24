import { SESSION_COOKIE, hashToken } from './auth.js';
import { rateLimit } from './redis.js';

/**
 * Identifies the caller without touching the database: the hashed session
 * cookie when signed in, the client IP otherwise.
 */
export function clientKey(event) {
  const token = getCookie(event, SESSION_COOKIE);
  if (token) return `u:${hashToken(token).slice(0, 16)}`;
  const ip =
    getRequestIP(event, { xForwardedFor: true }) ??
    event.node.req.socket?.remoteAddress ??
    'unknown';
  return `ip:${ip}`;
}

export function clientIp(event) {
  return (
    getRequestIP(event, { xForwardedFor: true }) ??
    event.node.req.socket?.remoteAddress ??
    'unknown'
  );
}

/**
 * Fixed-window throttle for expensive endpoints. Redis being unavailable means
 * the request is allowed through, exactly like the login limiter.
 */
export async function enforceRateLimit(
  event,
  name,
  limit,
  windowSeconds,
  key = clientKey(event)
) {
  const result = await rateLimit(`rl:${name}:${key}`, limit, windowSeconds);
  if (!result.allowed) {
    const minutes = Math.max(1, Math.round(windowSeconds / 60));
    const message = `Too many requests. Try again in about ${minutes} minute${
      minutes === 1 ? '' : 's'
    }.`;
    throw createError({
      statusCode: 429,
      statusMessage: message,
      data: { error: message },
    });
  }
  return result;
}
