/**
 * Registers the offline service worker in production builds only; the dev
 * server serves assets from memory and a stale cache there is confusing.
 */
import { clearPendingRead, listPendingReads } from '~/lib/local-db.js';

async function flushPendingReads() {
  if (!navigator.onLine) return;
  const pending = await listPendingReads().catch(() => []);
  for (const entry of pending) {
    try {
      await $fetch(`/api/items/${entry.id}`, {
        method: 'PATCH',
        body: { isRead: entry.isRead },
      });
      await clearPendingRead(entry.id);
    } catch {
      /* keep it queued for the next attempt */
    }
  }
}

export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('online', () => {
    flushPendingReads();
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'flush-reads') flushPendingReads();
  });

  if (import.meta.dev) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => flushPendingReads())
      .catch(() => {});
  });
});
