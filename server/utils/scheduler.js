import { listFeedsDueForRefresh, refreshFeed } from './feeds.js';

const TICK_MS = 60_000;
const BATCH_SIZE = 3;
const FIRST_TICK_MS = 15_000;

let timer = null;
let running = false;
const status = {
  enabled: false,
  lastRunAt: null,
  lastRefreshed: 0,
  lastError: null,
};

export function getSchedulerStatus() {
  return { ...status };
}

/**
 * One scheduler pass: pick the feeds whose subscribers are due for a poll and
 * refresh them sequentially. `refreshFeed` already takes a per-feed lock, so a
 * manual refresh racing with the scheduler never downloads the same feed twice.
 */
export async function runSchedulerTick() {
  if (running) return { skipped: true, refreshed: 0, results: [] };
  running = true;
  try {
    const feeds = await listFeedsDueForRefresh(BATCH_SIZE);
    const results = [];
    for (const feed of feeds) {
      const result = await refreshFeed(feed.id, { force: true });
      results.push({ id: feed.id, title: feed.title, ...result });
    }
    const refreshed = results.filter((entry) => !entry.error && !entry.skipped);
    const inserted = refreshed.reduce((sum, entry) => sum + (entry.inserted ?? 0), 0);

    status.lastRunAt = new Date().toISOString();
    status.lastRefreshed = refreshed.length;
    status.lastError = null;
    if (refreshed.length) {
      console.log(
        `[scheduler] refreshed ${refreshed.length} feed(s), ${inserted} new item(s)`
      );
    }
    return { refreshed: refreshed.length, inserted, results };
  } catch (error) {
    status.lastError = error.message;
    console.warn('[scheduler] tick failed:', error.message);
    return { refreshed: 0, inserted: 0, results: [], error: error.message };
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (timer) return;
  status.enabled = true;
  const tick = () => {
    runSchedulerTick().catch(() => {});
  };
  setTimeout(tick, FIRST_TICK_MS);
  timer = setInterval(tick, TICK_MS);
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
  status.enabled = false;
}
