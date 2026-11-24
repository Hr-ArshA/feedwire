<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { ChevronDown, Rss, Search } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { hostOf } from '@/utils/format.js';
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: null, default: '' },
});

const { state, setView } = useReader();

const open = ref(false);
const query = ref('');
const searchInput = ref(null);

const current = computed(() => {
  if (state.value.view.kind !== 'feed') return null;
  return (
    state.value.feeds.find(
      (feed) => feed.id === state.value.view.feedId
    ) ?? null
  );
});

const label = computed(
  () => current.value?.title || (current.value ? hostOf(current.value.url) : 'All feeds')
);

const filteredFeeds = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return state.value.feeds;
  return state.value.feeds.filter((feed) =>
    `${feed.title ?? ''} ${hostOf(feed.url)}`.toLowerCase().includes(q)
  );
});

function focusSearch(event) {
  event.preventDefault();
  nextTick(() => searchInput.value?.$el?.focus());
}

watch(open, (value) => {
  if (!value) query.value = '';
});
</script>

<template>
  <DropdownMenu v-model:open="open">
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        :class="cn('w-full justify-between gap-2', props.class)"
        aria-label="Choose a feed"
      >
        <span class="flex min-w-0 items-center gap-2">
          <Rss class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ label }}</span>
        </span>
        <ChevronDown class="size-4 shrink-0 opacity-60" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      align="start"
      class="max-h-[min(60vh,22rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
      @open-auto-focus="focusSearch"
    >
      <div
        class="sticky top-0 z-10 -mx-1 -mt-1 mb-1 border-b bg-popover p-1"
        @keydown.stop
        @keyup.stop
        @pointerdown.stop
      >
        <div class="relative flex items-center">
          <Search
            class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref="searchInput"
            v-model="query"
            type="search"
            placeholder="Search feeds"
            aria-label="Search feeds"
            class="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <DropdownMenuItem
        :class="state.view.kind === 'all' && 'bg-accent text-accent-foreground'"
        @select="setView('all')"
      >
        <span class="flex-1 truncate">All feeds</span>
        <Badge variant="secondary" class="px-1.5 text-[11px] tabular-nums">
          {{ state.stats.total }}
        </Badge>
      </DropdownMenuItem>

      <DropdownMenuItem
        v-for="feed in filteredFeeds"
        :key="feed.id"
        :class="
          state.view.kind === 'feed' &&
          state.view.feedId === feed.id &&
          'bg-accent text-accent-foreground'
        "
        @select="setView('feed', feed.id)"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate">{{ feed.title || hostOf(feed.url) }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ hostOf(feed.url) }}
          </span>
        </span>
        <Badge
          v-if="feed.unread_count"
          variant="secondary"
          class="px-1.5 text-[11px] tabular-nums"
        >
          {{ feed.unread_count }}
        </Badge>
      </DropdownMenuItem>

      <p
        v-if="state.feeds.length && !filteredFeeds.length"
        class="px-2 py-3 text-xs text-muted-foreground"
      >
        No feeds match your search.
      </p>

      <p
        v-if="!state.feeds.length"
        class="px-2 py-3 text-xs text-muted-foreground"
      >
        No feeds yet — add one first.
      </p>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
