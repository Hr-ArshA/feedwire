<script setup>
import { ArrowRight, Rss } from '@lucide/vue';
import { Button } from '@/components/ui/button';

const { user } = useAuth();
const config = useRuntimeConfig();
const siteUrl = String(config.public.siteUrl || '').replace(/\/+$/, '');

useSeoMeta({
  description:
    'A live, categorised view of the Hacker News front page. Create a free account to add your own RSS feeds, keep read/unread state, star favourites and search everything in English or Persian.',
  ogType: 'website',
  ogSiteName: 'Feedwire',
  ogTitle: 'Feedwire · Hacker News and your own feeds',
  ogDescription:
    'Read Hacker News and your own RSS feeds in one clean, bilingual reader.',
  ogUrl: `${siteUrl}/`,
  twitterCard: 'summary_large_image',
  twitterTitle: 'Feedwire · Hacker News and your own feeds',
  twitterDescription:
    'Read Hacker News and your own RSS feeds in one clean, bilingual reader.',
});

useHead({ link: [{ rel: 'canonical', href: `${siteUrl}/` }] });

const {
  state,
  loadItems,
  loadCategories,
  openItem,
  readHere,
  loadOpenMode,
} = useReader('public');

useHead({ title: 'Feedwire · Hacker News and your own feeds' });

definePageMeta({ middleware: 'home-redirect' });

onMounted(async () => {
  loadOpenMode();
  await Promise.all([loadItems(), loadCategories()]);
});
</script>

<template>
  <div class="mx-auto max-w-[1180px] px-4 py-8 sm:px-6">
    <section class="mb-8">
      <p
        class="mb-2 inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground"
      >
        <Rss class="size-3 text-primary" />
        Public feed · no account needed
      </p>
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        Today on Hacker News
      </h1>
      <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        A live, categorised view of the Hacker News front page. Create a free
        account to add your own feeds, keep read/unread state, star favourites
        and search everything in English or Persian.
      </p>

      <div v-if="!user" class="mt-4 flex flex-wrap items-center gap-2">
        <Button as-child>
          <NuxtLink to="/register">
            Create a free account
            <ArrowRight />
          </NuxtLink>
        </Button>
        <Button variant="outline" as-child>
          <NuxtLink to="/login">I already have one</NuxtLink>
        </Button>
      </div>
      <div v-else class="mt-4">
        <Button as-child>
          <NuxtLink to="/reader">
            Open my reader
            <ArrowRight />
          </NuxtLink>
        </Button>
      </div>
    </section>

    <div class="mb-3.5 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-baseline gap-2.5">
        <h2 class="text-lg font-bold tracking-tight">Latest stories</h2>
        <span class="text-xs text-muted-foreground">
          {{ state.total }} items
        </span>
      </div>
      <FiltersDialog reader-key="public" class="shrink-0" />
    </div>

    <ItemList
      :items="state.items"
      :loading="state.loading"
      :error="state.error"
      :has-more="state.hasMore"
      :categories="state.categories"
      readonly
      empty-title="No stories yet"
      empty-text="The public feed is still being fetched. Try again in a moment."
      @load-more="loadItems({ append: true })"
      @open="openItem"
      @read-here="readHere"
    />

    <p class="mt-6 text-center text-[11.5px] text-muted-foreground">
      Read/unread state, favourites and personal feeds live behind an account.
    </p>
  </div>
</template>
