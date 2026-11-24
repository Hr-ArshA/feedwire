import { hostOf, intervalLabel } from '~/utils/format.js';
import { queueReadState } from '~/lib/local-db.js';

const PAGE_SIZE = 50;
const OPEN_MODE_KEY = 'fw:open-mode';

function initialState() {
  return {
    feeds: [],
    stats: { total: 0, unread: 0, favorites: 0, read_later: 0 },
    items: [],
    hasMore: false,
    total: 0,
    view: { kind: 'all', feedId: null },
    query: '',
    mode: 'hybrid',
    category: null,
    tag: null,
    tags: [],
    categories: [],
    index: {
      ready: false,
      total: 0,
      embedded: 0,
      pending: 0,
      model: '',
      error: null,
    },
    loading: false,
    refreshing: false,
    adding: false,
    error: null,
    toast: null,
    selectedId: null,
    openMode: 'internal',
  };
}

let toastTimer = null;
let itemsRequest = 0;
let indexTimer = null;

/**
 * Shared reader state. `key` separates the public landing page from the
 * authenticated reader so the two never fight over the same arrays.
 */
export function useReader(key = 'reader') {
  const state = useState(key, initialState);
  const publicMode = key === 'public';
  const { t } = useI18n();

  function notify(message, type = 'info') {
    state.value.toast = { message, type };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.value.toast = null;
    }, 4200);
  }

  const viewTitle = computed(() => {
    if (state.value.view.kind === 'unread') return t('view.unread');
    if (state.value.view.kind === 'favorite') return t('view.favorites');
    if (state.value.view.kind === 'readlater') return t('view.readLater');
    if (state.value.tag) return `#${state.value.tag}`;
    if (state.value.view.kind === 'feed') {
      const feed = state.value.feeds.find(
        (entry) => entry.id === state.value.view.feedId
      );
      return feed?.title || t('view.feed');
    }
    return publicMode ? t('view.hackerNews') : t('view.allItems');
  });

  function filterFor(kind) {
    if (kind === 'unread') return 'unread';
    if (kind === 'favorite') return 'favorite';
    if (kind === 'readlater') return 'readlater';
    return 'all';
  }

  async function loadFeeds() {
    if (publicMode) return;
    const data = await $fetch('/api/feeds');
    state.value.feeds = data.feeds;
    state.value.stats = data.stats;
  }

  async function loadItems({ append = false } = {}) {
    const request = ++itemsRequest;
    state.value.loading = true;

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(append ? state.value.items.length : 0),
    });

    if (publicMode) {
      if (state.value.query) params.set('q', state.value.query);
      if (state.value.category) params.set('category', state.value.category);
      if (state.value.tag) params.set('tag', state.value.tag);
    } else {
      params.set('filter', filterFor(state.value.view.kind));
      if (state.value.view.kind === 'feed') {
        params.set('feed', String(state.value.view.feedId));
      }
      if (state.value.query) {
        params.set('q', state.value.query);
        params.set('mode', state.value.mode);
      }
      if (state.value.category) params.set('category', state.value.category);
    }

    const endpoint = publicMode ? '/api/public/items' : '/api/items';

    try {
      const data = await $fetch(`${endpoint}?${params}`);
      if (request !== itemsRequest) return;
      state.value.items = append
        ? [...state.value.items, ...data.items]
        : data.items;
      state.value.hasMore = data.hasMore;
      state.value.total = data.total;
      state.value.stats = data.stats;
      if (data.categories) state.value.categories = data.categories;
      state.value.error = null;
    } catch (error) {
      if (request === itemsRequest) {
        state.value.error = error?.data?.error ?? error.message;
      }
    } finally {
      if (request === itemsRequest) state.value.loading = false;
    }
  }

  function setView(kind, feedId = null) {
    state.value.view = { kind, feedId };
    state.value.tag = null;
    state.value.selectedId = null;
    state.value.items = [];
    state.value.hasMore = false;
    return loadItems();
  }

  function setQuery(query) {
    state.value.query = query;
    return loadItems();
  }

  function setMode(mode) {
    state.value.mode = mode;
    return state.value.query ? loadItems() : Promise.resolve();
  }

  function setCategory(category) {
    state.value.category =
      state.value.category === category ? null : category;
    return loadItems();
  }

  function setTag(tag) {
    state.value.tag = state.value.tag === tag ? null : tag;
    state.value.view = { kind: 'all', feedId: null };
    state.value.items = [];
    return loadItems();
  }

  async function loadTags() {
    if (publicMode) return;
    try {
      const data = await $fetch('/api/tags');
      state.value.tags = data.tags ?? [];
    } catch {
      /* tags are cosmetic */
    }
  }

  function loadOpenMode() {
    if (!import.meta.client) return;
    const stored = window.localStorage.getItem(OPEN_MODE_KEY);
    if (stored === 'internal' || stored === 'external') {
      state.value.openMode = stored;
    }
  }

  function setOpenMode(mode) {
    state.value.openMode = mode === 'external' ? 'external' : 'internal';
    if (import.meta.client) {
      window.localStorage.setItem(OPEN_MODE_KEY, state.value.openMode);
    }
  }

  function categoryLabel(id) {
    return state.value.categories.find((entry) => entry.id === id)?.label ?? id;
  }

  async function loadCategories() {
    try {
      const data = await $fetch('/api/categories');
      state.value.categories = data.categories;
    } catch {
      /* categories are cosmetic */
    }
  }

  async function loadIndexStatus() {
    const previous = state.value.index.pending;
    const data = await $fetch('/api/index-status');
    state.value.index = data;
    if (previous > 0 && data.pending === 0) {
      await loadCategories();
      await loadItems();
    }
    return data;
  }

  function startIndexPolling() {
    if (indexTimer) return;
    const tick = () => loadIndexStatus().catch(() => {});
    tick();
    indexTimer = setInterval(tick, 4000);
  }

  function stopIndexPolling() {
    clearInterval(indexTimer);
    indexTimer = null;
  }

  async function reindex() {
    try {
      const data = await $fetch('/api/reindex', { method: 'POST' });
      state.value.index = { ...state.value.index, ...data };
      notify(
        data.pending > 0
          ? `Re-indexing ${data.pending} items…`
          : 'Index is up to date'
      );
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  function adjustFeedUnread(feedId, delta) {
    const feed = state.value.feeds.find((entry) => entry.id === feedId);
    if (feed) feed.unread_count = Math.max(0, feed.unread_count + delta);
  }

  async function toggleRead(item, value) {
    if (publicMode) return;
    const next = value ?? !item.is_read;
    const previous = item.is_read;
    if (previous === next) return;

    item.is_read = next;
    state.value.stats.unread += next ? -1 : 1;
    adjustFeedUnread(item.feed_id, next ? -1 : 1);

    try {
      const data = await $fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        body: { isRead: next },
      });
      state.value.stats = data.stats;
    } catch (error) {
      if (import.meta.client && !navigator.onLine) {
        queueReadState(item.id, next).catch(() => {});
        navigator.serviceWorker?.ready
          .then((registration) => registration.sync?.register('sync-read-state'))
          .catch(() => {});
        notify('Saved offline — it will sync when you reconnect');
        return;
      }
      item.is_read = previous;
      state.value.stats.unread += next ? 1 : -1;
      adjustFeedUnread(item.feed_id, next ? 1 : -1);
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  async function toggleFavorite(item) {
    if (publicMode) return;
    const next = !item.is_favorite;
    item.is_favorite = next;
    state.value.stats.favorites += next ? 1 : -1;

    try {
      const data = await $fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        body: { isFavorite: next },
      });
      state.value.stats = data.stats;
      notify(next ? 'Added to favorites' : 'Removed from favorites');
    } catch (error) {
      item.is_favorite = !next;
      state.value.stats.favorites += next ? -1 : 1;
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  async function toggleReadLater(item) {
    if (publicMode) return;
    const next = !item.is_read_later;
    item.is_read_later = next;
    state.value.stats.read_later = Math.max(
      0,
      (state.value.stats.read_later ?? 0) + (next ? 1 : -1)
    );
    try {
      const data = await $fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        body: { isReadLater: next },
      });
      state.value.stats = data.stats;
      notify(next ? 'Saved to read later' : 'Removed from read later');
    } catch (error) {
      item.is_read_later = !next;
      state.value.stats.read_later = Math.max(
        0,
        (state.value.stats.read_later ?? 0) + (next ? -1 : 1)
      );
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  function openItem(item) {
    if (import.meta.client) {
      const target = item.resolved_link || item.link;
      if (state.value.openMode === 'internal') {
        navigateTo(`/item/${item.id}`);
      } else if (target) {
        window.open(target, '_blank', 'noopener,noreferrer');
      }
    }
    if (!publicMode && !item.is_read) toggleRead(item, true);
  }

  function readHere(item) {
    if (import.meta.client) navigateTo(`/item/${item.id}`);
    if (!publicMode && !item.is_read) toggleRead(item, true);
  }

  async function refreshAll() {
    if (publicMode || state.value.refreshing) return;
    state.value.refreshing = true;
    try {
      const data = await $fetch('/api/feeds/refresh', { method: 'POST' });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;
      const failed = data.results.filter((result) => result.error);
      const added = data.results.reduce(
        (sum, result) => sum + (result.inserted ?? 0),
        0
      );
      if (failed.length) {
        notify(
          `Refreshed ${data.results.length - failed.length}/${data.results.length} feeds · ${added} new`,
          'error'
        );
      } else {
        notify(
          added
            ? `Fetched ${added} new item${added === 1 ? '' : 's'}`
            : 'Already up to date'
        );
      }
      await loadItems();
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
    } finally {
      state.value.refreshing = false;
    }
  }

  async function refreshFeed(feed) {
    if (publicMode) return;
    try {
      const data = await $fetch(`/api/feeds/${feed.id}/refresh`, {
        method: 'POST',
      });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;
      if (data.result.error) {
        notify(data.result.error, 'error');
      } else {
        notify(
          data.result.inserted
            ? `${feed.title}: ${data.result.inserted} new item${data.result.inserted === 1 ? '' : 's'}`
            : `${feed.title}: up to date`
        );
      }
      await loadItems();
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  async function setFeedInterval(feed, minutes) {
    if (publicMode) return;
    try {
      const data = await $fetch(`/api/feeds/${feed.id}`, {
        method: 'PATCH',
        body: { fetchIntervalMinutes: minutes },
      });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;
      notify(
        minutes === 0
          ? `${feed.title}: polling paused`
          : `${feed.title}: refreshing every ${intervalLabel(minutes)}`
      );
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  async function setFeedNotify(feed, enabled) {
    if (publicMode) return;
    try {
      const data = await $fetch(`/api/feeds/${feed.id}`, {
        method: 'PATCH',
        body: { notify: enabled },
      });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;
      notify(
        enabled
          ? `Push notifications on for ${feed.title}`
          : `Push notifications off for ${feed.title}`
      );
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  async function addFeed(rawUrl) {
    if (publicMode) return false;
    state.value.adding = true;
    try {
      const data = await $fetch('/api/feeds', {
        method: 'POST',
        body: { url: rawUrl },
      });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;

      if (data.discovered) {
        notify(
          `Found the feed at ${hostOf(data.feed.url)} — added ${data.feed.title || 'feed'}`
        );
      } else if (data.reused) {
        notify(
          `${data.feed.title || 'Feed'} was already indexed — shared ${data.feeds.find((f) => f.id === data.feed.id)?.item_count ?? 0} items, no re-vectorising needed`
        );
      } else if (data.inserted) {
        notify(`Added ${data.feed.title || 'feed'} · ${data.inserted} items`);
      } else {
        notify(`Added ${data.feed.title || 'feed'}`);
      }

      await setView('feed', data.feed.id);
      return true;
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
      return false;
    } finally {
      state.value.adding = false;
    }
  }

  async function removeFeed(feed) {
    if (publicMode) return;
    try {
      const data = await $fetch(`/api/feeds/${feed.id}`, { method: 'DELETE' });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;
      notify(`Unsubscribed from ${feed.title}`);
      if (
        state.value.view.kind === 'feed' &&
        state.value.view.feedId === feed.id
      ) {
        await setView('all');
      } else {
        await loadItems();
      }
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  async function importOpml(file) {
    if (publicMode) return null;
    const xml = await file.text();
    try {
      const data = await $fetch('/api/feeds/opml', {
        method: 'POST',
        headers: { 'content-type': 'text/xml' },
        body: xml,
      });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;
      const parts = [`Imported ${data.imported} new feed${data.imported === 1 ? '' : 's'}`];
      if (data.reused) parts.push(`${data.reused} already known`);
      if (data.failed?.length) parts.push(`${data.failed.length} failed`);
      notify(parts.join(' · '), data.failed?.length ? 'error' : 'info');
      await loadItems();
      return data;
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
      return null;
    }
  }

  function exportOpml() {
    if (publicMode || !import.meta.client) return;
    window.location.href = '/api/feeds/opml';
  }

  async function markAllRead() {
    if (publicMode) return;
    try {
      const feedId =
        state.value.view.kind === 'feed' ? state.value.view.feedId : null;
      const data = await $fetch('/api/items/read-all', {
        method: 'POST',
        body: {
          feedId,
          filter: state.value.view.kind === 'favorite' ? 'favorite' : 'all',
        },
      });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;
      notify(
        data.changed
          ? `Marked ${data.changed} item${data.changed === 1 ? '' : 's'} as read`
          : 'Nothing left unread here'
      );
      await loadItems();
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  /**
   * Everything above `item` in the current list becomes read. The API does the
   * authoritative update; the local list is patched in place so the row does
   * not jump while the user is looking at it.
   */
  async function markAboveRead(item) {
    if (publicMode || !item) return;
    const index = state.value.items.findIndex((entry) => entry.id === item.id);
    const above = index > 0 ? state.value.items.slice(0, index) : [];
    const unreadAbove = above.filter((entry) => !entry.is_read);

    try {
      const data = await $fetch('/api/items/read-above', {
        method: 'POST',
        body: { itemId: item.id },
      });
      state.value.feeds = data.feeds;
      state.value.stats = data.stats;

      if (state.value.view.kind === 'unread') {
        await loadItems();
      } else {
        for (const entry of above) entry.is_read = true;
      }

      notify(
        data.changed
          ? `Marked ${data.changed} item${data.changed === 1 ? '' : 's'} above as read`
          : unreadAbove.length
            ? 'Nothing above was unread'
            : 'Nothing above to mark'
      );
    } catch (error) {
      notify(error?.data?.error ?? error.message, 'error');
    }
  }

  return {
    state,
    publicMode,
    viewTitle,
    notify,
    loadFeeds,
    loadItems,
    setView,
    setQuery,
    setMode,
    setCategory,
    setTag,
    loadTags,
    loadOpenMode,
    setOpenMode,
    categoryLabel,
    loadCategories,
    loadIndexStatus,
    startIndexPolling,
    stopIndexPolling,
    reindex,
    toggleRead,
    toggleFavorite,
    toggleReadLater,
    openItem,
    readHere,
    refreshAll,
    refreshFeed,
    setFeedInterval,
    setFeedNotify,
    addFeed,
    removeFeed,
    importOpml,
    exportOpml,
    markAllRead,
    markAboveRead,
  };
}
