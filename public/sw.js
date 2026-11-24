const VERSION = 'feedwire-v2';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const PRECACHE = ['/', '/share', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isStatic(pathname) {
  return (
    pathname.startsWith('/_nuxt/') ||
    pathname.startsWith('/icon') ||
    pathname === '/manifest.webmanifest'
  );
}

function isImage(pathname) {
  return pathname === '/api/proxy/image';
}

function isArticleApi(pathname) {
  return /^\/api\/items\/\d+\/(content|translation)$/.test(pathname);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  if (isImage(url.pathname)) {
    event.respondWith(cacheFirst(request, RUNTIME));
    return;
  }

  if (isArticleApi(url.pathname)) {
    event.respondWith(networkFirst(request, RUNTIME));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, RUNTIME, '/'));
  }
});

/* --------------------------------------------------------- Web Push */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text?.() ?? '' };
  }
  const title = payload.title || 'Feedwire';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'New stories are waiting',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag || 'feedwire',
      data: { url: payload.url || '/reader' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/reader';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ('focus' in client) {
            client.navigate(url).catch(() => {});
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

/* --------------------------------------------- Background Sync */

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('feedwire', 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

function remove(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function flushReads() {
  const db = await openDb();
  const entries = await getAll(db, 'pending-read');
  for (const entry of entries) {
    try {
      const response = await fetch('/api/items/' + entry.id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isRead: entry.isRead }),
      });
      if (response.ok) await remove(db, 'pending-read', entry.id);
    } catch {
      /* try again on the next sync */
    }
  }
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) client.postMessage({ type: 'flush-reads' });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-read-state') event.waitUntil(flushReads().catch(() => {}));
});
