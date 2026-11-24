<script setup>
import { computed, ref } from 'vue';
import { Bookmark, Compass, Rss, Search, Settings, Tag } from '@lucide/vue';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { categoryActive, categoryDot } from '@/lib/categories.js';
import { hostOf } from '@/utils/format.js';
import { cn } from '@/lib/utils';

const { state, setCategory, setView, setTag } = useReader();
const { t } = useI18n();

const topicQuery = ref('');
const feedQuery = ref('');

const visibleFeeds = computed(() => {
  const q = feedQuery.value.trim().toLowerCase();
  if (!q) return state.value.feeds;
  return state.value.feeds.filter((feed) =>
    `${feed.title ?? ''} ${hostOf(feed.url)}`.toLowerCase().includes(q)
  );
});

const visibleCategories = computed(() => {
  const q = topicQuery.value.trim().toLowerCase();
  return state.value.categories.filter(
    (category) =>
      (category.count || state.value.category === category.id) &&
      (!q ||
        `${category.label} ${category.fa ?? ''}`.toLowerCase().includes(q))
  );
});
</script>

<template>
  <aside
    class="sticky top-[86px] hidden max-h-[calc(100dvh-104px)] flex-col gap-4 overflow-y-auto pr-1 pb-4 lg:flex"
  >
    <div class="flex flex-col gap-2">
      <FiltersDialog class="w-full" />
      <AddFeedDialog class="w-full" />
    </div>

    <div>
      <p
        class="mb-2 px-2.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
      >
        {{ t('sidebar.feeds') }}
      </p>
      <div class="relative mb-2 flex items-center">
        <Search
          class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="feedQuery"
          type="search"
          :placeholder="t('sidebar.searchFeeds')"
          :aria-label="t('sidebar.searchFeeds')"
          class="h-8 pl-8 text-sm"
        />
      </div>
      <ScrollArea v-if="state.feeds.length" class="h-[15rem]">
        <ul v-if="visibleFeeds.length" class="flex flex-col gap-0.5 pr-1">
          <li>
            <button
              type="button"
              :aria-pressed="state.view.kind === 'all'"
              :class="
                cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  state.view.kind === 'all'
                    ? 'bg-primary/12 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              "
              @click="setView('all')"
            >
              <Rss class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ t('view.allFeeds') }}</span>
              <span
                v-if="state.stats.unread"
                class="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[10.5px] font-bold leading-4 text-primary-foreground tabular-nums"
              >
                {{ state.stats.unread > 999 ? '999+' : state.stats.unread }}
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              :aria-pressed="state.view.kind === 'readlater'"
              :class="
                cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  state.view.kind === 'readlater'
                    ? 'bg-primary/12 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              "
              @click="setView('readlater')"
            >
              <Bookmark class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ t('view.readLater') }}</span>
              <span
                v-if="state.stats.read_later"
                class="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[10.5px] font-bold leading-4 text-primary-foreground tabular-nums"
              >
                {{ state.stats.read_later > 999 ? '999+' : state.stats.read_later }}
              </span>
            </button>
          </li>
          <li v-for="feed in visibleFeeds" :key="feed.id">
            <button
              type="button"
              :title="feed.title || feed.url"
              :aria-pressed="
                state.view.kind === 'feed' && state.view.feedId === feed.id
              "
              :class="
                cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  state.view.kind === 'feed' && state.view.feedId === feed.id
                    ? 'bg-primary/12 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              "
              @click="setView('feed', feed.id)"
            >
              <span
                class="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                aria-hidden="true"
              />
              <span class="truncate">{{ feed.title || hostOf(feed.url) }}</span>
              <span
                v-if="feed.unread_count"
                class="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[10.5px] font-bold leading-4 text-primary-foreground tabular-nums"
              >
                {{ feed.unread_count > 999 ? '999+' : feed.unread_count }}
              </span>
            </button>
          </li>
        </ul>
        <p v-else class="px-2.5 py-2 text-xs text-muted-foreground">
          {{ t('sidebar.noFeedsMatch') }}
        </p>
      </ScrollArea>
      <p
        v-else
        class="px-2.5 py-2 text-xs text-muted-foreground"
      >
        No feeds yet — add one first.
      </p>
    </div>

    <div>
      <p
        class="mb-2 px-2.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
      >
        {{ t('sidebar.topics') }}
      </p>
      <div class="relative mb-2 flex items-center">
        <Search
          class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="topicQuery"
          type="search"
          :placeholder="t('sidebar.searchTopics')"
          :aria-label="t('sidebar.searchTopics')"
          class="h-8 pl-8 text-sm"
        />
      </div>
      <ScrollArea class="h-[13rem]">
        <ul v-if="visibleCategories.length" class="flex flex-col gap-0.5 pr-1">
          <li>
            <button
              type="button"
              :aria-pressed="!state.category"
              :class="
                cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  !state.category
                    ? 'bg-primary/12 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              "
              @click="setCategory(null)"
            >
              <span class="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {{ t('view.allTopics') }}
            </button>
          </li>
          <li v-for="category in visibleCategories" :key="category.id">
            <button
              type="button"
              :title="category.fa"
              :aria-pressed="state.category === category.id"
              :class="
                cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  state.category === category.id
                    ? cn('font-semibold', categoryActive(category.id))
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              "
              @click="setCategory(category.id)"
            >
              <span
                :class="cn('size-1.5 rounded-full', categoryDot(category.id))"
                aria-hidden="true"
              />
              <span class="truncate">{{ category.label }}</span>
              <span class="ml-auto text-xs tabular-nums opacity-60">
                {{ category.count }}
              </span>
            </button>
          </li>
        </ul>
        <p v-else class="px-2.5 py-2 text-xs text-muted-foreground">
          {{ t('sidebar.noTopicsMatch') }}
        </p>
      </ScrollArea>
    </div>

    <div v-if="state.tags.length">
      <p
        class="mb-2 px-2.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
      >
        {{ t('view.tags') }}
      </p>
      <ScrollArea class="h-[8rem]">
        <ul class="flex flex-col gap-0.5 pr-1">
          <li v-for="entry in state.tags" :key="entry.tag">
            <button
              type="button"
              :aria-pressed="state.tag === entry.tag"
              :class="
                cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  state.tag === entry.tag
                    ? 'bg-primary/12 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              "
              @click="setTag(entry.tag)"
            >
              <Tag class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ entry.tag }}</span>
              <span class="ml-auto text-xs tabular-nums opacity-60">
                {{ entry.count }}
              </span>
            </button>
          </li>
        </ul>
      </ScrollArea>
    </div>

    <div class="mt-auto flex flex-col gap-0.5 border-t pt-2">
      <NuxtLink
        to="/explore"
        class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <Compass class="size-4" />
        {{ t('sidebar.exploreFeeds') }}
      </NuxtLink>
      <NuxtLink
        to="/settings"
        class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <Settings class="size-4" />
        {{ t('nav.settings') }}
      </NuxtLink>
    </div>
  </aside>
</template>
