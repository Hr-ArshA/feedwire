import { getRedis } from './redis.js';

/**
 * A small Redis-backed job queue.
 *
 * Jobs survive a process restart because they live in Redis, not in memory.
 * A worker moves a job from the ready list to a processing list before running
 * it, so a crash mid-job leaves the entry in processing where the next worker
 * can reclaim it. Failed jobs are retried with a delay and finally parked in a
 * dead-letter list instead of being lost.
 */

const READY = 'jobs:ready';
const PROCESSING = 'jobs:processing';
const DELAYED = 'jobs:delayed';
const DEAD = 'jobs:dead';

const handlers = new Map();
let workerClient = null;
let running = false;
let started = false;
let reclaimTimer = null;

export function registerJobHandler(name, handler) {
  handlers.set(name, handler);
}

export function jobHandlers() {
  return [...handlers.keys()];
}

export async function enqueueJob(name, payload = {}, options = {}) {
  const redis = await getRedis();
  if (!redis) throw new Error('Redis is unavailable; cannot enqueue jobs');
  const job = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    payload,
    attempts: 0,
    maxAttempts: options.maxAttempts ?? 5,
    enqueuedAt: new Date().toISOString(),
  };
  if (options.delayMs && options.delayMs > 0) {
    await redis.zAdd(DELAYED, [{ score: Date.now() + options.delayMs, value: JSON.stringify(job) }]);
  } else {
    await redis.lPush(READY, JSON.stringify(job));
  }
  return job.id;
}

export async function queueStats() {
  const redis = await getRedis();
  if (!redis) return { ready: 0, processing: 0, delayed: 0, dead: 0, available: false };
  const [ready, processing, delayed, dead] = await Promise.all([
    redis.lLen(READY),
    redis.lLen(PROCESSING),
    redis.zCard(DELAYED),
    redis.lLen(DEAD),
  ]);
  return { ready, processing, delayed, dead, available: true };
}

async function moveDueDelayed(redis) {
  const due = await redis.zRangeByScore(DELAYED, 0, Date.now(), { LIMIT: { offset: 0, count: 20 } });
  for (const raw of due) {
    const removed = await redis.zRem(DELAYED, raw);
    if (removed) await redis.lPush(READY, raw);
  }
}

async function reclaimStale(redis) {
  // Anything left in processing for more than five minutes belongs to a worker
  // that died; push it back to the ready list.
  const stale = await redis.lRange(PROCESSING, 0, -1);
  for (const raw of stale) {
    try {
      const job = JSON.parse(raw);
      const age = Date.now() - new Date(job.startedAt ?? job.enqueuedAt).getTime();
      if (age > 5 * 60_000) {
        await redis.lRem(PROCESSING, 1, raw);
        await redis.lPush(READY, raw);
      }
    } catch {
      await redis.lRem(PROCESSING, 1, raw);
    }
  }
}

async function runJob(redis, raw) {
  let job;
  try {
    job = JSON.parse(raw);
  } catch {
    await redis.lRem(PROCESSING, 1, raw);
    return;
  }
  const handler = handlers.get(job.name);
  if (!handler) {
    await redis.lRem(PROCESSING, 1, raw);
    await redis.lPush(DEAD, raw);
    return;
  }

  job.startedAt = new Date().toISOString();
  try {
    await handler(job.payload, job);
    await redis.lRem(PROCESSING, 1, raw);
  } catch (error) {
    await redis.lRem(PROCESSING, 1, raw);
    job.attempts = (job.attempts ?? 0) + 1;
    job.lastError = String(error?.message ?? error).slice(0, 500);
    if (job.attempts < job.maxAttempts) {
      const delay = Math.min(60_000, 2 ** job.attempts * 1000);
      await redis.zAdd(DELAYED, [{ score: Date.now() + delay, value: JSON.stringify(job) }]);
    } else {
      await redis.lPush(DEAD, JSON.stringify(job));
      console.warn('[jobs] job failed permanently:', job.name, job.lastError);
    }
  }
}

async function loop() {
  if (running) return;
  running = true;
  const redis = await getRedis();
  if (!redis) {
    running = false;
    return;
  }
  try {
    workerClient = redis.duplicate();
    await workerClient.connect();
  } catch (error) {
    running = false;
    console.warn('[jobs] worker could not connect:', error.message);
    return;
  }

  reclaimTimer = setInterval(() => {
    moveDueDelayed(workerClient).catch(() => {});
    reclaimStale(workerClient).catch(() => {});
  }, 30_000);

  const consume = async () => {
    while (running) {
      try {
        await moveDueDelayed(workerClient);
        const raw = await workerClient.brPopLPush(READY, PROCESSING, 5);
        if (raw) await runJob(workerClient, raw);
      } catch (error) {
        if (!running) break;
        console.warn('[jobs] worker error:', error.message);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  };
  consume();
}

export function startJobWorker() {
  if (started) return;
  started = true;
  loop().catch((error) => console.warn('[jobs] worker failed to start:', error.message));
}

export async function stopJobWorker() {
  running = false;
  clearInterval(reclaimTimer);
  reclaimTimer = null;
  if (workerClient) {
    await workerClient.quit().catch(() => {});
    workerClient = null;
  }
  started = false;
}
