<script setup>
import { computed, ref } from 'vue';
import { Check, Loader2, Plus, Search, Sparkles } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { categoryActive } from '@/lib/categories.js';
import { CATALOG_TAGS } from '@/lib/popular-feeds.js';
import { hostOf } from '@/utils/format.js';
import { cn } from '@/lib/utils';

const { user } = useAuth();
const config = useRuntimeConfig();
const siteUrl = String(config.public.siteUrl || '').replace(/\/+$/, '');

useSeoMeta({
  title: 'Explore feeds · Feedwire',
  description:
    'Browse hand-picked RSS feeds across technology, security, world news, science, design, gaming and Persian tech. Add any of them to your reader in one tap.',
  ogTitle: 'Explore feeds · Feedwire',
  ogDescription:
    'Hand-picked RSS feeds across technology, security, world news, science, design, gaming and Persian tech.',
  ogUrl: `${siteUrl}/explore`,
});

useHead({
  title: 'Explore feeds · Feedwire',
  link: [{ rel: 'canonical', href: `${siteUrl}/explore` }],
});

const requestFetch = useRequestFetch();

const { data, pending, error, refresh } = await useAsyncData(
  'explore',
  () => requestFetch('/api/explore')
);

const signedIn = computed(() => Boolean(data.value?.signedIn || user.value));

const query = ref('');
const tag = ref(null);
const adding = ref(null);
const notice = ref(null);
let noticeTimer = null;

const searchInput = ref(null);

function focusSearch() {
  searchInput.value?.$el?.focus();
}

function notify(message, type = 'info') {
  notice.value = { message, type };
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
  }, 4000);
}

const visibleFeeds = computed(() => {
  const list = data.value?.catalog ?? [];
  const q = query.value.trim().toLowerCase();
  return list.filter((feed) => {
    if (tag.value && feed.tag !== tag.value) return false;
    if (!q) return true;
    return `${feed.title} ${feed.description} ${feed.tag} ${hostOf(feed.url)}`
      .toLowerCase()
      .includes(q);
  });
});

function initials(title) {
  return String(title ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function tileClass(feedTag) {
  return categoryActive(String(feedTag ?? '').toLowerCase());
}

async function add(feed) {
  if (!signedIn.value) {
    await navigateTo('/login');
    return;
  }
  if (adding.value || feed.subscribed) return;
  adding.value = feed.url;
  try {
    const result = await $fetch('/api/feeds', {
      method: 'POST',
      body: { url: feed.url },
    });
    feed.subscribed = true;
    feed.subscribers = (feed.subscribers ?? 0) + 1;
    notify(
      result?.reused
        ? `${feed.title} was already indexed — added to your reader`
        : `Added ${feed.title}`
    );
  } catch (requestError) {
    notify(
      requestError?.data?.error ?? requestError?.message ?? 'Could not add that feed',
      'error'
    );
  } finally {
    adding.value = null;
  }
}
</script>

<template>
  <div class="mx-auto max-w-[1180px] px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8">
    <header class="mb-5">
      <p
        class="mb-2 inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground"
      >
        <Sparkles class="size-3 text-primary" />
        Curated by Feedwire
      </p>
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Explore feeds</h1>
      <p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        New and different corners of the web — add any of them to your reader in
        one tap. Feeds are shared, so a feed someone already follows never gets
        downloaded or vectorised twice.
      </p>
    </header>

    <div class="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <div class="relative flex min-w-0 flex-1 items-center">
        <Search
          class="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="Search feeds, topics or sites"
          aria-label="Search feeds"
          class="pl-9"
        />
      </div>
      <Button
        v-if="!signedIn"
        as-child
        class="shrink-0"
      >
        <NuxtLink to="/login">Sign in to add feeds</NuxtLink>
      </Button>
    </div>

    <ScrollArea orientation="horizontal" class="mb-5 w-full">
      <div class="flex w-max items-center gap-2 pb-2">
        <button
          type="button"
          :aria-pressed="!tag"
          :class="
            cn(
              'inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
              !tag
                ? 'border-primary bg-primary/12 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-ring/60 hover:text-foreground'
            )
          "
          @click="tag = null"
        >
          All feeds
        </button>
        <button
          v-for="entry in CATALOG_TAGS"
          :key="entry"
          type="button"
          :aria-pressed="tag === entry"
          :class="
            cn(
              'inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
              tag === entry
                ? categoryActive(entry.toLowerCase())
                : 'border-border bg-card text-muted-foreground hover:border-ring/60 hover:text-foreground'
            )
          "
          @click="tag = tag === entry ? null : entry"
        >
          {{ entry }}
        </button>
      </div>
    </ScrollArea>

    <div v-if="pending" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div
        v-for="index in 8"
        :key="index"
        class="h-56 animate-pulse rounded-xl border bg-card"
      />
    </div>

    <p
      v-else-if="error"
      class="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
    >
      Could not load the catalog.
      <Button variant="link" size="sm" class="px-1" @click="refresh()">
        Try again
      </Button>
    </p>

    <template v-else>
      <div
        class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        <article
          v-for="feed in visibleFeeds"
          :key="feed.url"
          class="flex flex-col overflow-hidden rounded-xl border bg-card"
        >
          <div
            :class="
              cn(
                'flex aspect-[16/9] items-center justify-center border-b',
                tileClass(feed.tag)
              )"
          >
            <span class="text-2xl font-bold tracking-tight opacity-80">
              {{ initials(feed.title) }}
            </span>
          </div>

          <div class="flex flex-1 flex-col p-3">
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{{ feed.title }}</p>
                <p class="truncate text-[11px] text-muted-foreground">
                  {{ hostOf(feed.url) }}
                </p>
              </div>
              <Badge variant="secondary" class="shrink-0 text-[10px]">
                {{ feed.tag }}
              </Badge>
            </div>

            <p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {{ feed.description }}
            </p>

            <div class="mt-auto flex items-center justify-between gap-2 pt-3">
              <span class="text-[11px] text-muted-foreground tabular-nums">
                {{ feed.subscribers }}
                {{ feed.subscribers === 1 ? 'reader' : 'readers' }}
              </span>
              <Button
                size="sm"
                :variant="feed.subscribed ? 'secondary' : 'default'"
                :disabled="feed.subscribed || adding === feed.url"
                :aria-label="feed.subscribed ? `${feed.title} added` : `Add ${feed.title}`"
                @click="add(feed)"
              >
                <Loader2 v-if="adding === feed.url" class="animate-spin" />
                <Check v-else-if="feed.subscribed" />
                <Plus v-else />
                <span class="hidden sm:inline">
                  {{ feed.subscribed ? 'Added' : 'Add' }}
                </span>
              </Button>
            </div>
          </div>
        </article>
      </div>

      <p
        v-if="!visibleFeeds.length"
        class="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
      >
        No feeds match your search.
      </p>

      <section
        v-if="data?.popular?.length"
        class="mt-8 rounded-xl border bg-card"
      >
        <div class="border-b px-4 py-3">
          <h2 class="text-sm font-semibold">Popular on this server</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            What other readers here are already following.
          </p>
        </div>
        <ul class="divide-y">
          <li
            v-for="feed in data.popular"
            :key="feed.url"
            class="flex items-center gap-3 px-4 py-2.5"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ feed.title || hostOf(feed.url) }}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{ hostOf(feed.url) }}
              </p>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
              {{ feed.subscribers }}
              {{ feed.subscribers === 1 ? 'reader' : 'readers' }}
            </span>
            <Button
              size="sm"
              :variant="feed.subscribed ? 'secondary' : 'outline'"
              :disabled="feed.subscribed || adding === feed.url"
              @click="add(feed)"
            >
              <Check v-if="feed.subscribed" />
              <Plus v-else />
              <span class="hidden sm:inline">
                {{ feed.subscribed ? 'Added' : 'Add' }}
              </span>
            </Button>
          </li>
        </ul>
      </section>
    </template>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="notice"
        :class="
          cn(
            'fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-popover px-4 py-2 text-sm shadow-lg lg:bottom-6',
            notice.type === 'error' && 'border-destructive/50 text-destructive'
          )
        "
      >
        {{ notice.message }}
      </div>
    </Transition>

    <MobileNav active="explore" @search="focusSearch" />
  </div>
</template>
