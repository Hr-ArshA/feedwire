<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  FileType,
  Languages,
  Loader2,
  MessageSquare,
  Printer,
  TriangleAlert,
  WifiOff,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { hostOf, timeAgo } from '@/utils/format.js';
import { categoryBadge } from '@/lib/categories.js';
import {
  getLocalArticle,
  saveArticle,
  saveLocalTranslation,
} from '@/lib/local-db.js';
import { cn } from '@/lib/utils';

const route = useRoute();
const { user } = useAuth();

const itemId = computed(() => Number(route.params.id));
const article = ref(null);
const loading = ref(true);
const error = ref(null);
const offline = ref(false);

const tab = ref('article');
const translation = ref(null);
const translating = ref(false);
const translateError = ref(null);

const exporting = ref(null);
const exportError = ref(null);

const originalLink = computed(
  () => article.value?.resolved_link || article.value?.link || null
);
const host = computed(() => hostOf(originalLink.value));
const published = computed(() =>
  timeAgo(article.value?.published_at || article.value?.fetched_at)
);
const categoryName = computed(() => article.value?.category ?? null);
const backTo = computed(() => (user.value ? '/reader' : '/'));
const paragraphs = computed(() =>
  String(translation.value?.text ?? '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
);

const proseClasses =
  'text-[15px] leading-7 text-foreground/90 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground [&_figure]:my-5 [&_h1]:mt-7 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-6 [&_img]:my-5 [&_img]:w-full [&_img]:rounded-lg [&_img]:border [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[13px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5';

function markRead() {
  if (!user.value) return;
  $fetch(`/api/items/${itemId.value}`, {
    method: 'PATCH',
    body: { isRead: true },
  }).catch(() => {});
}

async function loadTranslation() {
  try {
    const data = await $fetch(
      `/api/items/${itemId.value}/translation?lang=fa`
    );
    if (data?.translation?.text) translation.value = data.translation;
  } catch {
    /* translation is optional */
  }
}

async function load() {
  loading.value = true;
  error.value = null;
  offline.value = false;
  article.value = null;

  try {
    const data = await $fetch(`/api/items/${itemId.value}/content`);
    article.value = data;
    if (!data.html && data.error) error.value = data.error;
    if (data.html) {
      saveArticle(data).catch(() => {});
      loadTranslation();
    }
    markRead();
  } catch (requestError) {
    const local = await getLocalArticle(itemId.value).catch(() => null);
    if (local?.html) {
      article.value = { ...local, content_indexed: true, error: null };
      translation.value = local.translation ?? null;
      offline.value = true;
    } else {
      error.value =
        requestError?.data?.error ??
        requestError?.message ??
        'Could not load this story';
    }
  } finally {
    loading.value = false;
  }
}

async function translate() {
  tab.value = 'translation';
  if (translating.value || translation.value?.text) return;
  if (!article.value?.html) {
    translateError.value = 'This story has no text to translate';
    return;
  }

  translating.value = true;
  translateError.value = null;
  try {
    const data = await $fetch(`/api/items/${itemId.value}/translate`, {
      method: 'POST',
      body: { lang: 'fa' },
    });
    translation.value = data.translation;
    saveLocalTranslation(itemId.value, data.translation).catch(() => {});
  } catch (requestError) {
    translateError.value =
      requestError?.data?.error ??
      requestError?.message ??
      'Translation failed';
  } finally {
    translating.value = false;
  }
}

async function download(format) {
  if (exporting.value) return;
  exporting.value = format;
  exportError.value = null;
  try {
    const response = await $fetch.raw(
      `/api/items/${itemId.value}/export?format=${format}`,
      { responseType: 'blob' }
    );
    const disposition = response.headers.get('content-disposition') ?? '';
    const filename =
      /filename="([^"]+)"/.exec(disposition)?.[1] ?? `article.${format}`;
    const url = URL.createObjectURL(response._data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (requestError) {
    exportError.value =
      requestError?.data?.error ?? requestError?.message ?? 'Export failed';
  } finally {
    exporting.value = null;
  }
}

function exportPdf() {
  window.open(`/print/${itemId.value}?auto=1`, '_blank', 'noopener');
}

onMounted(load);

useHead(() => ({
  title: article.value?.title
    ? `${article.value.title} · Feedwire`
    : 'Reading · Feedwire',
}));
</script>

<template>
  <div class="mx-auto max-w-[760px] px-3 py-4 sm:px-6 sm:py-8">
    <div class="mb-3 flex items-center justify-between gap-2 sm:mb-4">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink :to="backTo">
          <ArrowLeft />
          Back
        </NuxtLink>
      </Button>

      <div class="flex items-center gap-1.5 sm:gap-2">
        <Button
          v-if="article?.html"
          variant="outline"
          size="sm"
          :disabled="translating"
          @click="translate"
        >
          <Loader2 v-if="translating" class="animate-spin" />
          <Languages v-else />
          <span class="hidden sm:inline">
            {{ translating ? 'Translating…' : 'Translate' }}
          </span>
        </Button>

        <DropdownMenu v-if="article?.html">
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" :disabled="!!exporting">
              <Download />
              <span class="hidden sm:inline">
                {{ exporting ? 'Exporting…' : 'Export' }}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="download('html')">
              <FileCode />
              HTML
            </DropdownMenuItem>
            <DropdownMenuItem @select="download('md')">
              <FileText />
              Markdown
            </DropdownMenuItem>
            <DropdownMenuItem @select="download('txt')">
              <FileType />
              Plain text
            </DropdownMenuItem>
            <DropdownMenuItem @select="exportPdf">
              <Printer />
              PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button v-if="originalLink" variant="outline" size="sm" as-child>
          <a :href="originalLink" target="_blank" rel="noopener noreferrer">
            <span class="hidden sm:inline">Open original</span>
            <ExternalLink />
          </a>
        </Button>
      </div>
    </div>

    <p
      v-if="exportError"
      class="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-sm text-destructive"
    >
      {{ exportError }}
    </p>

    <p
      v-if="offline"
      class="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <WifiOff class="size-3.5" />
      Offline copy — saved on this device
    </p>

    <article class="overflow-hidden rounded-xl border bg-card">
      <header class="border-b px-4 py-4 sm:px-8 sm:py-6">
        <div
          v-if="article"
          class="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground [&>*+*]:before:mr-2 [&>*+*]:before:text-muted-foreground/50 [&>*+*]:before:content-['·']"
        >
          <Badge
            v-if="categoryName && categoryName !== 'other'"
            variant="outline"
            :class="cn('border px-2', categoryBadge(categoryName))"
          >
            {{ categoryName }}
          </Badge>
          <span class="max-w-[18rem] truncate">{{ article.feed_title }}</span>
          <span v-if="article.author" class="max-w-[12rem] truncate">
            {{ article.author }}
          </span>
          <span v-if="host" class="hidden sm:inline">{{ host }}</span>
          <span v-if="published">{{ published }}</span>
          <a
            v-if="originalLink"
            :href="originalLink"
            target="_blank"
            rel="noopener noreferrer"
            class="underline decoration-border underline-offset-2 outline-none transition-colors hover:text-primary"
          >
            <span class="inline-flex items-center gap-1">
              <MessageSquare class="size-3" />
              Source
            </span>
          </a>
        </div>

        <h1
          v-if="article"
          class="text-xl leading-snug font-bold tracking-tight sm:text-2xl"
        >
          {{ article.title }}
        </h1>
        <Skeleton v-else class="h-7 w-3/4" />

        <p
          v-if="article?.content_indexed === false && article.html"
          class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-0.5 text-[11.5px] font-semibold text-primary"
        >
          <Loader2 class="size-3 animate-spin" />
          Indexing this story for search…
        </p>
      </header>

      <Tabs v-model="tab" class="px-4 py-4 sm:px-8 sm:py-6">
        <TabsList>
          <TabsTrigger value="article">Article</TabsTrigger>
          <TabsTrigger value="translation" @click="translate">
            <Languages />
            فارسی
          </TabsTrigger>
        </TabsList>

        <TabsContent value="article" class="mt-4">
          <div v-if="loading" class="space-y-3">
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-11/12" />
            <Skeleton class="h-4 w-10/12" />
            <Skeleton class="h-40 w-full" />
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-9/12" />
          </div>

          <div
            v-else-if="error"
            class="flex flex-col items-start gap-2 rounded-lg border border-dashed px-5 py-6"
          >
            <p class="inline-flex items-center gap-1.5 text-sm font-semibold">
              <TriangleAlert class="size-4 text-destructive" />
              This story could not be shown here
            </p>
            <p class="text-sm text-muted-foreground">{{ error }}</p>
            <Button
              v-if="originalLink"
              variant="outline"
              size="sm"
              class="mt-1"
              as-child
            >
              <a :href="originalLink" target="_blank" rel="noopener noreferrer">
                Open the original page
                <ExternalLink />
              </a>
            </Button>
          </div>

          <div v-else-if="article" :class="proseClasses" v-html="article.html" />
        </TabsContent>

        <TabsContent value="translation" class="mt-4" dir="rtl">
          <div v-if="translating" class="space-y-3">
            <p class="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 class="size-4 animate-spin" />
              در حال ترجمه با گوگل ترنسلیت…
            </p>
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-11/12" />
            <Skeleton class="h-4 w-10/12" />
            <Skeleton class="h-4 w-full" />
          </div>

          <div
            v-else-if="translateError"
            class="flex flex-col items-start gap-2 rounded-lg border border-dashed px-5 py-6"
          >
            <p class="inline-flex items-center gap-1.5 text-sm font-semibold">
              <TriangleAlert class="size-4 text-destructive" />
              ترجمه انجام نشد
            </p>
            <p class="text-sm text-muted-foreground" dir="ltr">
              {{ translateError }}
            </p>
            <Button variant="outline" size="sm" class="mt-1" @click="translate">
              تلاش دوباره
            </Button>
          </div>

          <div v-else-if="paragraphs.length" class="text-[15px] leading-8">
            <h2 class="mb-3 text-lg font-bold tracking-tight">
              {{ translation.title || article.title }}
            </h2>
            <p v-for="(part, index) in paragraphs" :key="index" class="my-3">
              {{ part }}
            </p>
            <p class="mt-6 text-xs text-muted-foreground">
              ترجمه ماشینی توسط گوگل ترنسلیت — ممکن است ناقص باشد.
            </p>
          </div>

          <div v-else class="flex flex-col items-start gap-2 py-4">
            <p class="text-sm text-muted-foreground">
              ترجمه‌ای برای این خبر ذخیره نشده است.
            </p>
            <Button variant="outline" size="sm" @click="translate">
              <Languages />
              دریافت ترجمه
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </article>

    <p class="mt-4 text-center text-[11.5px] text-muted-foreground">
      Saved once and shared across everyone who reads this story.
    </p>
  </div>
</template>
