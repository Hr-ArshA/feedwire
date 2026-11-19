<script setup>
import { computed, onMounted } from 'vue';
import { ArrowLeft, Printer } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { hostOf, timeAgo } from '@/utils/format.js';

const route = useRoute();
const itemId = Number(route.params.id);
const requestFetch = useRequestFetch();

const { data: article, error } = await useAsyncData(`print:${itemId}`, () =>
  requestFetch(`/api/items/${itemId}/content`)
);

const failure = computed(() => {
  if (article.value?.html) return null;
  return (
    error.value?.data?.error ??
    error.value?.message ??
    article.value?.error ??
    'Article content is not available'
  );
});

const meta = computed(() => {
  if (!article.value) return '';
  return [
    article.value.feed_title,
    article.value.author,
    hostOf(article.value.link),
    timeAgo(article.value.published_at || article.value.fetched_at),
  ]
    .filter(Boolean)
    .join(' · ');
});

useHead(() => ({
  title: article.value?.title ? `${article.value.title} · Print` : 'Print · Feedwire',
}));

function printPage() {
  window.print();
}

onMounted(() => {
  if (!route.query.auto) return;
  const pending = Array.from(document.images).filter((image) => !image.complete);
  const ready = pending.length
    ? Promise.all(
        pending.map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            })
        )
      )
    : Promise.resolve();
  ready.then(() => setTimeout(() => window.print(), 350));
});
</script>

<template>
  <div
    class="mx-auto max-w-[760px] px-4 py-6 text-foreground sm:px-6 print:max-w-none print:px-0 print:py-0 print:text-black"
  >
    <div class="mb-5 flex items-center justify-between gap-3 print:hidden">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="`/item/${itemId}`">
          <ArrowLeft />
          Back to reader
        </NuxtLink>
      </Button>
      <Button variant="outline" size="sm" @click="printPage">
        <Printer />
        Print / Save as PDF
      </Button>
    </div>

    <div
      v-if="failure"
      class="rounded-lg border border-dashed px-5 py-6 text-sm text-muted-foreground print:border-0 print:px-0"
    >
      {{ failure }}
    </div>

    <article v-else-if="article" class="print:text-black">
      <h1 class="text-2xl leading-snug font-bold tracking-tight print:text-xl">
        {{ article.title }}
      </h1>
      <p class="mt-2 mb-6 text-xs text-muted-foreground print:text-black">
        {{ meta }}
      </p>

      <div
        class="text-[15px] leading-7 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground [&_figure]:my-5 [&_h1]:mt-7 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-6 [&_img]:my-5 [&_img]:w-full [&_img]:rounded-lg [&_img]:border [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[13px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 print:[&_img]:break-inside-avoid print:[&_pre]:break-inside-avoid"
        v-html="article.html"
      />

      <p
        v-if="article.link"
        class="mt-8 border-t pt-4 text-xs break-all text-muted-foreground print:text-black"
      >
        Source:
        <a :href="article.link" class="underline underline-offset-2">
          {{ article.link }}
        </a>
      </p>
    </article>
  </div>
</template>
