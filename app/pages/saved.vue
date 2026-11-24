<script setup>
import { onMounted, ref } from 'vue';
import { ArrowLeft, HardDriveDownload, Trash2, WifiOff } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listLocalArticles, deleteLocalArticle } from '@/lib/local-db.js';
import { timeAgo } from '@/utils/format.js';

useHead({ title: 'Offline library · Feedwire' });

useSeoMeta({ robots: 'noindex,nofollow' });

const articles = ref([]);
const loading = ref(true);
const failure = ref(null);

async function load() {
  loading.value = true;
  failure.value = null;
  try {
    articles.value = await listLocalArticles();
  } catch (error) {
    failure.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function remove(article) {
  await deleteLocalArticle(article.id).catch(() => {});
  articles.value = articles.value.filter((entry) => entry.id !== article.id);
}

function goSearch() {
  navigateTo('/reader');
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-[760px] px-3 py-5 pb-24 sm:px-6 sm:py-8 lg:pb-8">
    <div class="mb-4 flex items-center justify-between gap-3">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink to="/reader">
          <ArrowLeft />
          Back
        </NuxtLink>
      </Button>
    </div>

    <div class="mb-5">
      <h1 class="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
        <HardDriveDownload class="size-5 text-primary" />
        Offline library
      </h1>
      <p class="mt-1.5 text-sm text-muted-foreground">
        Every story you open is saved on this device, so it stays readable
        without an internet connection.
      </p>
    </div>

    <div v-if="failure" class="rounded-lg border border-dashed px-4 py-5 text-sm">
      {{ failure }}
    </div>

    <div v-else-if="loading" class="space-y-2">
      <Skeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-xl" />
    </div>

    <div
      v-else-if="!articles.length"
      class="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center"
    >
      <WifiOff class="size-7 text-muted-foreground" />
      <h2 class="text-base font-semibold">Nothing saved yet</h2>
      <p class="max-w-sm text-sm text-muted-foreground">
        Open any story in the reader and it will appear here automatically.
      </p>
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="article in articles"
        :key="article.id"
        class="flex items-start gap-2 rounded-xl border bg-card px-3.5 py-3"
      >
        <NuxtLink
          :to="`/item/${article.id}`"
          class="min-w-0 flex-1 outline-none"
        >
          <p class="line-clamp-2 text-sm font-semibold leading-snug">
            {{ article.title }}
          </p>
          <p
            class="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground"
          >
            <span class="max-w-[14rem] truncate">{{ article.feed_title }}</span>
            <span>·</span>
            <span>saved {{ timeAgo(article.savedAt) }}</span>
            <span v-if="article.translation?.text" class="text-primary">
              · فارسی
            </span>
          </p>
        </NuxtLink>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remove from offline library"
          class="shrink-0 hover:text-destructive"
          @click="remove(article)"
        >
          <Trash2 />
        </Button>
      </li>
    </ul>

    <MobileNav active="offline" @search="goSearch" />
  </div>
</template>
