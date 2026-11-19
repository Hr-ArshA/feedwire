/**
 * Registers the offline service worker in production builds only; the dev
 * server serves assets from memory and a stale cache there is confusing.
 */
export default defineNuxtPlugin(() => {
  if (import.meta.dev) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
});
