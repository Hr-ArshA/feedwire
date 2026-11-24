import { createClient } from 'redis';

let client = null;
let connecting = null;
let warned = false;

export async function getRedis() {
  if (client?.isReady) return client;
  if (!connecting) {
    const config = useRuntimeConfig();
    client = createClient({ url: config.redisUrl });
    client.on('error', (error) => {
      if (!warned) {
        warned = true;
        console.warn('[redis]', error.message);
      }
    });
    connecting = client.connect().catch((error) => {
      console.warn('[redis] unavailable, continuing without cache:', error.message);
      return null;
    });
  }
  await connecting;
  return client?.isReady ? client : null;
}

export async function cacheGet(key) {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  try {
    const redis = await getRedis();
    if (!redis) return;
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    /* cache is best-effort */
  }
}

export async function cacheDel(...keys) {
  try {
    const redis = await getRedis();
    if (!redis || !keys.length) return;
    await redis.del(keys.flat());
  } catch {
    /* cache is best-effort */
  }
}

export async function cacheDelPattern(pattern) {
  try {
    const redis = await getRedis();
    if (!redis) return;
    let cursor = '0';
    do {
      const page = await redis.scan(cursor, { MATCH: pattern, COUNT: 200 });
      cursor = page.cursor;
      if (page.keys.length) await redis.del(page.keys);
    } while (cursor !== '0');
  } catch {
    /* cache is best-effort */
  }
}

/**
 * Small fixed-window counter used to throttle login attempts.
 */
export async function rateLimit(key, limit, windowSeconds) {
  try {
    const redis = await getRedis();
    if (!redis) return { allowed: true, remaining: limit };
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

/** How many keys the cache currently holds, for the operator dashboard. */
export async function cacheKeyCount() {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    return await redis.dbSize();
  } catch {
    return null;
  }
}

/**
 * Drops every cached entry. Sessions are cached under `sess:*`, after this the
 * next request simply rebuilds them from PostgreSQL.
 */
export async function cacheFlush() {
  try {
    const redis = await getRedis();
    if (!redis) return { ok: false, keys: 0 };
    const keys = await redis.dbSize();
    await redis.flushDb();
    return { ok: true, keys };
  } catch {
    return { ok: false, keys: 0 };
  }
}
