<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Loader2, RefreshCw, Search } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

definePageMeta({ middleware: 'auth' });
useSeoMeta({ robots: 'noindex,nofollow' });
useHead({ title: 'My reader · Feedwire' });

const {
  state,
  viewTitle,
  loadFeeds,
  loadItems,
  loadCategories,
  startIndexPolling,
  stopIndexPolling,
  setMode,
  setQuery,
  loadOpenMode,
  toggleRead,
  toggleFavorite,
  toggleReadLater,
  loadTags,
  openItem,
  readHere,
  refreshAll,
  markAllRead,
  markAboveRead,
} = useReader();

const { t } = useI18n();

const search = ref(null);
let searchTimer = null;

const modes = [
  { id: 'hybrid', label: 'mode.hybrid' },
  { id: 'keyword', label: 'mode.keyword' },
  { id: 'semantic', label: 'mode.semantic' },
];

const shortcuts = [
  ['j', 'k', 'navigate'],
  ['o', 'open'],
  ['m', 'read'],
  ['f', 'favorite'],
  ['r', 'refresh'],
  ['/', 'search'],
];

function onSearchInput(event) {
  const value = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery(value.trim()), 250);
}

function clearSearch() {
  if (search.value) search.value.$el.value = '';
  clearTimeout(searchTimer);
  setQuery('');
}

function focusSearch() {
  search.value?.$el?.focus();
}

async function select(index) {
  const item = state.value.items[index];
  if (!item) return;
  state.value.selectedId = item.id;
  await nextTick();
  document
    .querySelector(`[data-item-id="${item.id}"]`)
    ?.scrollIntoView({ block: 'nearest' });
}

function selectedItem() {
  return state.value.items.find((item) => item.id === state.value.selectedId) ?? null;
}

function onKeydown(event) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  ) {
    if (event.key === 'Escape') target.blur();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const index = state.value.items.findIndex(
    (item) => item.id === state.value.selectedId
  );
  const current = selectedItem();

  switch (event.key) {
    case 'j':
      event.preventDefault();
      select(Math.min(index + 1, state.value.items.length - 1));
      break;
    case 'k':
      event.preventDefault();
      select(index <= 0 ? 0 : index - 1);
      break;
    case 'o':
      if (current) openItem(current);
      break;
    case 'm':
      if (current) toggleRead(current);
      break;
    case 'f':
      if (current) toggleFavorite(current);
      break;
    case 'r':
      refreshAll();
      break;
    case '/':
      event.preventDefault();
      focusSearch();
      break;
    default:
      break;
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  loadOpenMode();
  try {
    await loadFeeds();
  } catch (error) {
    state.value.error = error?.data?.error ?? error.message;
  }
  loadCategories();
  loadTags();
  startIndexPolling();
  await loadItems();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  clearTimeout(searchTimer);
  stopIndexPolling();
});
</script>

<template>
  <div
    class="mx-auto grid max-w-[1180px] grid-cols-1 items-start gap-6 px-4 py-5 pb-24 sm:px-6 sm:py-6 lg:grid-cols-[258px_minmax(0,1fr)] lg:gap-7 lg:pb-6"
  >
    <Sidebar />

    <main class="min-w-0 pb-10">
      <div class="mb-3 flex items-center gap-2 lg:hidden">
        <FiltersDialog />
        <FeedPicker class="min-w-0 flex-1" />
        <Button
          variant="outline"
          size="icon"
          class="shrink-0"
          :disabled="state.refreshing"
          :aria-label="t('action.refreshAll')"
          @click="refreshAll"
        >
          <RefreshCw :class="cn(state.refreshing && 'animate-spin')" />
        </Button>
      </div>

      <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-baseline gap-2.5">
          <h1 class="truncate text-xl font-bold tracking-tight">{{ viewTitle }}</h1>
          <span class="shrink-0 text-xs text-muted-foreground">
            {{ state.items.length }} {{ t('reader.shown') }}
          </span>
          <span
            v-if="state.index.pending"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-0.5 text-[11.5px] font-semibold text-primary"
            :title="`${state.index.model} · dot-product index`"
          >
            <Loader2 class="size-3 animate-spin" />
            {{ t('reader.indexing') }} {{ state.index.embedded }}/{{ state.index.total }}
          </span>
        </div>

        <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <ToggleGroup
            v-if="state.query"
            :model-value="state.mode"
            type="single"
            :aria-label="t('reader.searchMode')"
            @update:model-value="(value) => value && setMode(value)"
          >
            <ToggleGroupItem
              v-for="mode in modes"
              :key="mode.id"
              :value="mode.id"
            >
              {{ t(mode.label) }}
            </ToggleGroupItem>
          </ToggleGroup>

          <div
            class="relative flex min-w-0 flex-1 basis-full items-center sm:basis-auto sm:flex-none"
          >
            <Search
              class="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref="search"
              type="search"
              :aria-label="t('reader.searchItems')"
              :placeholder="`${t('reader.searchItems')}  ( / )`"
              class="pl-9 sm:w-[220px] focus-visible:sm:w-[280px]"
              @input="onSearchInput"
              @keydown.esc="clearSearch"
            />
          </div>

          <Button variant="outline" class="shrink-0" @click="markAllRead">
            <span class="hidden sm:inline">{{ t('action.markAllRead') }}</span>
            <span class="sm:hidden">{{ t('action.readAll') }}</span>
          </Button>

          <Button
            variant="outline"
            class="hidden shrink-0 lg:inline-flex"
            :disabled="state.refreshing"
            :aria-label="t('action.refreshAll')"
            @click="refreshAll"
          >
            <RefreshCw :class="cn(state.refreshing && 'animate-spin')" />
            <span class="hidden xl:inline">
              {{ state.refreshing ? t('action.refreshing') : t('action.refresh') }}
            </span>
          </Button>
        </div>
      </div>

      <ItemList
        :items="state.items"
        :loading="state.loading"
        :error="state.error"
        :has-more="state.hasMore"
        :categories="state.categories"
        :selected-id="state.selectedId"
        :empty-title="state.query ? t('reader.noMatches') : t('reader.nothingHere')"
        :empty-text="
          state.query
            ? t('reader.noMatchText')
            : t('reader.emptyText')
        "
        @load-more="loadItems({ append: true })"
        @open="openItem"
        @read-here="readHere"
        @toggle-read="toggleRead"
        @toggle-favorite="toggleFavorite"
        @toggle-read-later="toggleReadLater"
        @mark-above="markAboveRead"
      />

      <p
        class="mt-5 hidden flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted-foreground lg:flex"
      >
        <template v-for="([keys, label], index) in shortcuts" :key="label">
          <span class="inline-flex items-center gap-1">
            <kbd
              v-for="key in keys"
              :key="key"
              class="min-w-[18px] rounded-[5px] border bg-card px-1.5 py-px text-center text-[11px] text-muted-foreground"
              >{{ key }}</kbd
            >
            {{ label }}
          </span>
          <span v-if="index < shortcuts.length - 1" class="text-muted-foreground/40"
            >·</span
          >
        </template>
      </p>
    </main>

    <AddFeedDialog mode="fab" />

    <MobileNav active="reader" @search="focusSearch" />

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="state.toast"
        role="status"
        aria-live="polite"
        :class="
          cn(
            'fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-popover px-4 py-2 text-sm shadow-lg lg:bottom-6',
            state.toast.type === 'error' && 'border-destructive/50 text-destructive'
          )
        "
      >
        {{ state.toast.message }}
      </div>
    </Transition>
  </div>
</template>
