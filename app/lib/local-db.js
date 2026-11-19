const DB_NAME = 'feedwire';
const DB_VERSION = 1;
const STORE = 'articles';

let dbPromise = null;

function openDb() {
  if (!import.meta.client || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Local storage is not available'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function run(mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        let request;
        try {
          request = action(store);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(request?.result ?? null);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

/**
 * Every article opened in the reader is copied here, so it stays readable
 * without a network connection.
 */
export async function saveArticle(article) {
  const record = {
    id: Number(article.id),
    title: article.title ?? '',
    link: article.link ?? null,
    author: article.author ?? null,
    feed_title: article.feed_title ?? '',
    published_at: article.published_at ?? null,
    fetched_at: article.fetched_at ?? null,
    category: article.category ?? null,
    html: article.html ?? '',
    text: article.text ?? '',
    savedAt: new Date().toISOString(),
  };
  await run('readwrite', (store) => store.put(record));
  return record;
}

export function getLocalArticle(id) {
  return run('readonly', (store) => store.get(Number(id)));
}

export async function listLocalArticles() {
  const rows = (await run('readonly', (store) => store.getAll())) ?? [];
  return rows.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

export function deleteLocalArticle(id) {
  return run('readwrite', (store) => store.delete(Number(id)));
}

export async function saveLocalTranslation(id, translation) {
  const existing = await getLocalArticle(id);
  if (!existing) return null;
  existing.translation = translation;
  await run('readwrite', (store) => store.put(existing));
  return existing;
}

export async function clearLocalArticles() {
  return run('readwrite', (store) => store.clear());
}
