<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  Bookmark,
  Download,
  Eye,
  ExternalLink,
  FileCode,
  FileText,
  FileType,
  Headphones,
  Highlighter,
  Languages,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Printer,
  RotateCw,
  Sparkles,
  Square,
  Star,
  Tag,
  Trash2,
  TriangleAlert,
  WifiOff,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
const config = useRuntimeConfig();
const requestFetch = useRequestFetch();

const itemId = computed(() => Number(route.params.id));
const siteUrl = String(config.public.siteUrl || '').replace(/\/+$/, '');
const canonical = computed(() => `${siteUrl}/item/${itemId.value}`);

/**
 * Always the fast path: the server answers with whatever it already has and
 * flags `pending` when the body still has to be downloaded. That keeps the
 * route transition instant, so the loading state can actually be shown instead
 * of the browser sitting on the previous page for the whole download.
 */
const {
  data: fetched,
  error: fetchError,
  pending,
} = await useAsyncData(
  () => `item:${itemId.value}`,
  () =>
    requestFetch(`/api/items/${itemId.value}/content?wait=0`),
  { watch: [itemId] }
);

const localArticle = ref(null);
const contentPending = ref(false);
const article = computed(() => localArticle.value ?? fetched.value ?? null);
const loading = computed(
  () => (pending.value || contentPending.value) && !article.value?.html
);
const offline = ref(false);

// The download can take a while for a hostile publisher; after a few seconds
// the loader explains itself and offers the original page instead.
const slowLoad = ref(false);
let slowLoadTimer = null;
watch(
  loading,
  (value) => {
    clearTimeout(slowLoadTimer);
    if (!value) {
      slowLoad.value = false;
      return;
    }
    slowLoadTimer = setTimeout(() => {
      slowLoad.value = true;
    }, 4000);
  },
  { immediate: true }
);
onBeforeUnmount(() => clearTimeout(slowLoadTimer));

function messageOf(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

const error = computed(() => {
  if (article.value?.html) return null;
  if (loading.value) return null;
  return (
    messageOf(article.value?.error) ??
    messageOf(fetchError.value?.data?.error) ??
    messageOf(fetchError.value?.statusMessage) ??
    messageOf(fetchError.value?.message) ??
    'This story could not be loaded.'
  );
});

const partial = computed(() => Boolean(article.value?.partial));

const requestEvent = useRequestEvent();
if (
  import.meta.server &&
  requestEvent &&
  fetchError.value?.statusCode === 404
) {
  setResponseStatus(requestEvent, 404, 'Story not found');
}

const tab = ref('article');
const translation = ref(null);
const translating = ref(false);
const translateError = ref(null);

const exporting = ref(null);
const exportError = ref(null);
const retrying = ref(false);
const retryError = ref(null);

/* Engagement: readers who opened this story here, and how many liked it. */
const stats = ref(fetched.value?.stats ?? null);
const liking = ref(false);
const likeError = ref(null);

/* Machine summary, generated once on the server and cached on the story. */
const summary = ref(null);
const summaryLoading = ref(false);
const summaryError = ref(null);
const summaryOpen = ref(false);

/* Nearest neighbours in the vector space the search already uses. */
const related = ref([]);
const relatedLoading = ref(false);

const speech = useSpeech();
const listeningTo = ref(null);
const mounted = ref(false);

const { t } = useI18n();
const articleEl = ref(null);
const isReadLater = ref(false);
const tags = ref([]);
const tagInput = ref('');
const note = ref('');
const noteSaving = ref(false);
const noteSaved = ref(false);
const highlights = ref([]);
const highlightNote = ref('');
const highlightError = ref(null);

const viewerLiked = computed(() => Boolean(stats.value?.liked));
const readersLabel = computed(() => Number(stats.value?.readers ?? 0));
const likesLabel = computed(() => Number(stats.value?.likes ?? 0));

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

const shareUrl = computed(() =>
  import.meta.client ? `${window.location.origin}/item/${itemId.value}` : canonical.value
);

const description = computed(() =>
  String(article.value?.summary || article.value?.text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
);

const ogImage = computed(() => {
  const match = String(article.value?.html ?? '').match(/<img[^>]+src="([^"]+)"/i);
  const src = match?.[1];
  if (!src) return undefined;
  return src.startsWith('http') ? src : `${siteUrl}${src}`;
});

const proseClasses =
  'text-[15px] leading-7 text-foreground/90 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground [&_figure]:my-5 [&_h1]:mt-7 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mt-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-6 [&_img]:my-5 [&_img]:w-full [&_img]:rounded-lg [&_img]:border [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[13px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5';

function markRead() {
  if (!user.value) return;
  $fetch(`/api/items/${itemId.value}`, {
    method: 'PATCH',
    body: { isRead: true },
  }).catch(() => {});
}

/** One row per reader on the server, so a revisit never inflates the count. */
function recordView() {
  if (!user.value) return;
  $fetch(`/api/items/${itemId.value}/view`, { method: 'POST' })
    .then((data) => {
      if (data?.stats) stats.value = data.stats;
    })
    .catch(() => {});
}

async function toggleLike() {
  if (!user.value || liking.value) return;
  liking.value = true;
  likeError.value = null;
  const next = !viewerLiked.value;
  try {
    const data = await $fetch(`/api/items/${itemId.value}`, {
      method: 'PATCH',
      body: { isFavorite: next },
    });
    stats.value = {
      ...(stats.value ?? {}),
      liked: Boolean(data?.item?.is_favorite),
      likes: Math.max(
        0,
        Number(stats.value?.likes ?? 0) + (next ? 1 : -1)
      ),
    };
  } catch (requestError) {
    likeError.value =
      requestError?.data?.error ?? 'Could not save that. Try again.';
  } finally {
    liking.value = false;
  }
}

async function loadExtras() {
  if (!user.value) return;
  try {
    const data = await $fetch(`/api/items/${itemId.value}/extras`);
    tags.value = data.tags ?? [];
    note.value = data.note ?? '';
    highlights.value = data.highlights ?? [];
    isReadLater.value = Boolean(data.is_read_later);
  } catch {
    /* annotations are optional */
  }
}

async function toggleReadLater() {
  const next = !isReadLater.value;
  isReadLater.value = next;
  try {
    await $fetch(`/api/items/${itemId.value}`, {
      method: 'PATCH',
      body: { isReadLater: next },
    });
  } catch {
    isReadLater.value = !next;
  }
}

async function saveTags(next) {
  highlightError.value = null;
  try {
    const data = await $fetch(`/api/items/${itemId.value}/tags`, {
      method: 'PUT',
      body: { tags: next },
    });
    tags.value = data.tags ?? [];
  } catch (requestError) {
    highlightError.value = requestError?.data?.error ?? requestError.message;
  }
}

function addTag() {
  const value = tagInput.value.trim().toLowerCase();
  if (!value) return;
  if (!tags.value.includes(value)) saveTags([...tags.value, value]);
  tagInput.value = '';
}

function removeTag(tag) {
  saveTags(tags.value.filter((entry) => entry !== tag));
}

async function saveNote() {
  noteSaving.value = true;
  highlightError.value = null;
  try {
    await $fetch(`/api/items/${itemId.value}/note`, {
      method: 'PUT',
      body: { note: note.value },
    });
    noteSaved.value = true;
    setTimeout(() => {
      noteSaved.value = false;
    }, 2000);
  } catch (requestError) {
    highlightError.value = requestError?.data?.error ?? requestError.message;
  } finally {
    noteSaving.value = false;
  }
}

async function addHighlight() {
  highlightError.value = null;
  const selection = import.meta.client ? window.getSelection() : null;
  const quote = selection?.toString().trim();
  if (!quote) {
    highlightError.value = 'Select some text in the article first.';
    return;
  }
  try {
    const data = await $fetch(`/api/items/${itemId.value}/highlights`, {
      method: 'POST',
      body: { quote, note: highlightNote.value || null },
    });
    highlights.value = [data.highlight, ...highlights.value];
    highlightNote.value = '';
    selection?.removeAllRanges();
  } catch (requestError) {
    highlightError.value = requestError?.data?.error ?? requestError.message;
  }
}

async function removeHighlight(id) {
  try {
    await $fetch(`/api/items/${itemId.value}/highlights/${id}`, {
      method: 'DELETE',
    });
    highlights.value = highlights.value.filter((entry) => entry.id !== id);
  } catch {
    /* ignore */
  }
}

async function loadSummary() {
  if (summaryLoading.value) return;
  summaryOpen.value = true;
  if (summary.value?.summary) return;
  summaryLoading.value = true;
  summaryError.value = null;
  try {
    summary.value = await $fetch(`/api/items/${itemId.value}/summary`, {
      method: 'POST',
      body: {},
    });
  } catch (requestError) {
    summaryError.value =
      requestError?.data?.error ??
      requestError?.message ??
      'Could not summarise this story';
  } finally {
    summaryLoading.value = false;
  }
}

async function loadRelated() {
  if (relatedLoading.value || related.value.length) return;
  relatedLoading.value = true;
  try {
    const data = await $fetch(`/api/items/${itemId.value}/related`, {
      query: { limit: 5 },
    });
    related.value = data.items ?? [];
  } catch {
    /* related stories are a bonus, never an error state */
  } finally {
    relatedLoading.value = false;
  }
}

function listen(target) {
  const text =
    target === 'summary'
      ? summary.value?.summary
      : article.value?.text || article.value?.summary;
  if (!text) return;
  listeningTo.value = target;
  speech.toggle(text, 'en');
}

function stopListening() {
  speech.stop();
  listeningTo.value = null;
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

async function retry() {
  if (retrying.value) return;
  retrying.value = true;
  retryError.value = null;
  try {
    const data = await $fetch(`/api/items/${itemId.value}/refresh-content`, {
      method: 'POST',
    });
    localArticle.value = null;
    fetched.value = data;
    if (data?.stats) stats.value = data.stats;
    if (data.html) {
      saveArticle(data).catch(() => {});
      loadTranslation();
    }
  } catch (requestError) {
    retryError.value =
      requestError?.data?.error ??
      requestError?.message ??
      'Could not refresh this story';
  } finally {
    retrying.value = false;
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

async function download(format, lang = null) {
  if (exporting.value) return;
  exporting.value = `${lang ?? 'src'}:${format}`;
  exportError.value = null;
  try {
    const query = new URLSearchParams({ format });
    if (lang) query.set('lang', lang);
    const response = await $fetch.raw(
      `/api/items/${itemId.value}/export?${query}`,
      { responseType: 'blob' }
    );
    const disposition = response.headers.get('content-disposition') ?? '';
    const utf8Name = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    const filename = utf8Name
      ? decodeURIComponent(utf8Name)
      : /filename="([^"]+)"/.exec(disposition)?.[1] ?? `article.${format}`;
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

function exportPdf(lang = null) {
  const suffix = lang ? `&lang=${lang}` : '';
  window.open(`/print/${itemId.value}?auto=1${suffix}`, '_blank', 'noopener');
}

async function loadContent() {
  if (contentPending.value) return;
  contentPending.value = true;
  try {
    const data = await $fetch(`/api/items/${itemId.value}/content`);
    fetched.value = data;
    if (data?.stats) stats.value = data.stats;
    if (data?.html) {
      saveArticle(data).catch(() => {});
      loadTranslation();
      markRead();
    }
  } catch (requestError) {
    fetchError.value = requestError;
  } finally {
    contentPending.value = false;
  }
}

watch(itemId, () => {
  localArticle.value = null;
  translation.value = null;
  translateError.value = null;
  retryError.value = null;
  stats.value = null;
  summary.value = null;
  summaryOpen.value = false;
  summaryError.value = null;
  related.value = [];
  tags.value = [];
  note.value = '';
  highlights.value = [];
  isReadLater.value = false;
  stopListening();
  loadExtras();
});

// The session resolves asynchronously; load annotations once the reader is
// known, not only on the first mount.
watch(
  () => user.value?.id,
  (id) => {
    if (id) loadExtras();
  }
);

// Client-side navigation lands on a pending shell too; fetch the body as soon
// as the server says it is not cached.
watch(
  () => fetched.value?.pending,
  (isPending) => {
    if (isPending && import.meta.client && !contentPending.value) loadContent();
  }
);

onMounted(async () => {
  mounted.value = true;
  recordView();
  loadRelated();
  loadExtras();

  if (article.value?.html) {
    saveArticle(article.value).catch(() => {});
    loadTranslation();
    markRead();
    return;
  }

  const local = await getLocalArticle(itemId.value).catch(() => null);
  if (local?.html) {
    localArticle.value = { ...local, content_indexed: true, error: null };
    translation.value = local.translation ?? null;
    offline.value = true;
    return;
  }

  // The server sent the shell without waiting for the publisher; fetch the
  // body now. Extraction is single-flight on the server, so a prefetch that
  // started when the card was pressed is reused instead of downloaded twice.
  if (!article.value?.error) await loadContent();
});

const seoTitle = computed(() =>
  article.value?.title
    ? `${article.value.title} · Feedwire`
    : fetchError.value?.statusCode === 404
      ? 'Story not found · Feedwire'
      : 'Reading · Feedwire'
);
const seoDescription = computed(
  () => description.value || 'Read the full story on Feedwire.'
);
const seoRobots = computed(() =>
  error.value ? 'noindex,nofollow' : 'index,follow'
);
const seoImage = computed(() => ogImage.value);
const seoArticleTitle = computed(() => article.value?.title);

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  robots: seoRobots,
  ogType: 'article',
  ogSiteName: 'Feedwire',
  ogTitle: seoArticleTitle,
  ogDescription: seoDescription,
  ogUrl: canonical,
  ogImage: seoImage,
  twitterCard: 'summary_large_image',
  twitterTitle: seoArticleTitle,
  twitterDescription: seoDescription,
  twitterImage: seoImage,
  articlePublishedTime: computed(() => article.value?.published_at),
  articleModifiedTime: computed(() => article.value?.fetched_at),
});

useHead(() => ({
  link: [{ rel: 'canonical', href: canonical.value }],
  script: article.value?.title
    ? [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: article.value.title,
            datePublished: article.value.published_at ?? undefined,
            dateModified: article.value.fetched_at ?? undefined,
            description: description.value,
            image: ogImage.value ? [ogImage.value] : undefined,
            mainEntityOfPage: canonical.value,
            author: {
              '@type': 'Organization',
              name: article.value.feed_title || 'Feedwire',
            },
            publisher: { '@type': 'Organization', name: 'Feedwire' },
          }),
        },
      ]
    : [],
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
          aria-label="Translate to Persian"
          @click="translate"
        >
          <Loader2 v-if="translating" class="animate-spin" />
          <Languages v-else />
          <span class="hidden sm:inline">
            {{ translating ? 'Translating…' : 'Translate' }}
          </span>
        </Button>

        <Button
          v-if="article?.html"
          variant="outline"
          size="sm"
          :disabled="summaryLoading"
          aria-label="Summarise this story"
          @click="loadSummary"
        >
          <Loader2 v-if="summaryLoading" class="animate-spin" />
          <Sparkles v-else />
          <span class="hidden sm:inline">Summary</span>
        </Button>

        <Button
          v-if="mounted && article?.text && speech.supported.value"
          variant="outline"
          size="sm"
          :aria-label="speech.speaking.value ? 'Pause reading aloud' : 'Listen to this story'"
          @click="listen('article')"
        >
          <Pause v-if="speech.speaking.value && !speech.paused.value" />
          <Play v-else-if="speech.paused.value" />
          <Headphones v-else />
          <span class="hidden sm:inline">
            {{ speech.speaking.value ? 'Pause' : 'Listen' }}
          </span>
        </Button>

        <Button
          v-if="user"
          variant="outline"
          size="sm"
          :disabled="liking"
          :aria-pressed="viewerLiked"
          :aria-label="viewerLiked ? 'Remove from your favourites' : 'Like this story'"
          :class="viewerLiked && 'text-[var(--star)]'"
          @click="toggleLike"
        >
          <Star :class="viewerLiked && 'fill-current'" />
          <span class="tabular-nums">{{ likesLabel }}</span>
        </Button>

        <Button
          v-if="user"
          variant="outline"
          size="sm"
          :aria-pressed="isReadLater"
          :aria-label="isReadLater ? t('item.removeReadLater') : t('item.readLater')"
          :class="isReadLater && 'text-primary'"
          @click="toggleReadLater"
        >
          <Bookmark :class="isReadLater && 'fill-current'" />
          <span class="hidden sm:inline">{{ t('item.readLater') }}</span>
        </Button>

        <DropdownMenu v-if="article?.html">
          <DropdownMenuTrigger as-child>
            <Button
              variant="outline"
              size="sm"
              :disabled="!!exporting"
              aria-label="Export this story"
            >
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
            <DropdownMenuItem @select="exportPdf()">
              <Printer />
              PDF
            </DropdownMenuItem>

            <template v-if="translation?.text">
              <DropdownMenuSeparator />
              <DropdownMenuItem @select="download('html', 'fa')">
                <Languages />
                Translation · HTML
              </DropdownMenuItem>
              <DropdownMenuItem @select="download('md', 'fa')">
                <Languages />
                Translation · Markdown
              </DropdownMenuItem>
              <DropdownMenuItem @select="download('txt', 'fa')">
                <Languages />
                Translation · Text
              </DropdownMenuItem>
              <DropdownMenuItem @select="exportPdf('fa')">
                <Printer />
                Translation · PDF
              </DropdownMenuItem>
            </template>
          </DropdownMenuContent>
        </DropdownMenu>

        <ShareMenu
          v-if="article?.title"
          :url="shareUrl"
          :title="article.title"
        />

        <Button
          v-if="originalLink"
          variant="outline"
          size="sm"
          as-child
          aria-label="Open the original page"
        >
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
      v-if="retryError"
      class="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-sm text-destructive"
    >
      {{ retryError }}
    </p>

    <p
      v-if="likeError"
      class="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-sm text-destructive"
    >
      {{ likeError }}
    </p>

    <div
      v-if="speech.error.value"
      class="mb-3 flex items-start gap-2 rounded-lg border bg-muted/50 px-3.5 py-2 text-sm"
    >
      <Headphones class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p class="flex-1 text-muted-foreground">{{ speech.error.value }}</p>
      <Button variant="ghost" size="sm" @click="speech.error.value = null">
        Dismiss
      </Button>
    </div>

    <p
      v-if="offline"
      class="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground"
    >
      <WifiOff class="size-3.5" />
      Offline copy — saved on this device
    </p>

    <article ref="articleEl" class="overflow-hidden rounded-xl border bg-card">
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
          <span v-if="readersLabel > 0" class="inline-flex items-center gap-1">
            <Eye class="size-3" />
            <span class="tabular-nums">{{ readersLabel }}</span>
            {{ readersLabel === 1 ? 'reader' : 'readers' }}
          </span>
          <span v-if="likesLabel > 0" class="inline-flex items-center gap-1">
            <Star class="size-3 text-[var(--star)]" />
            <span class="tabular-nums">{{ likesLabel }}</span>
            {{ likesLabel === 1 ? 'like' : 'likes' }}
          </span>
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
          <div v-if="loading" class="flex flex-col gap-4">
            <div
              class="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <Loader2 class="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">Loading the article…</p>
                <p class="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                  {{
                    slowLoad
                      ? 'This publisher is slow, or blocks automated reading. You can open the original page while we keep trying.'
                      : 'Downloading the page and cleaning it up for reading.'
                  }}
                </p>
                <div v-if="slowLoad" class="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" @click="retry">
                    <RotateCw />
                    Try again
                  </Button>
                  <Button v-if="originalLink" variant="outline" size="sm" as-child>
                    <a :href="originalLink" target="_blank" rel="noopener noreferrer">
                      Open the original page
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
            <div class="space-y-3">
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-11/12" />
              <Skeleton class="h-4 w-10/12" />
              <Skeleton class="h-40 w-full" />
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-9/12" />
            </div>
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
            <div class="mt-1 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="retrying"
                @click="retry"
              >
                <Loader2 v-if="retrying" class="animate-spin" />
                <RotateCw v-else />
                {{ retrying ? 'Trying again…' : 'Try again' }}
              </Button>
              <Button v-if="originalLink" variant="outline" size="sm" as-child>
                <a :href="originalLink" target="_blank" rel="noopener noreferrer">
                  Open the original page
                  <ExternalLink />
                </a>
              </Button>
            </div>
          </div>

          <template v-else-if="article">
            <div
              v-if="partial"
              class="mb-4 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm"
            >
              <p class="inline-flex items-center gap-1.5 font-semibold">
                <TriangleAlert class="size-4 text-[var(--star)]" />
                Preview only
              </p>
              <p class="mt-1 text-muted-foreground">
                {{ article.error || 'This publisher blocks automated reading.' }}
                Below is the summary from the feed.
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="retrying"
                  @click="retry"
                >
                  <Loader2 v-if="retrying" class="animate-spin" />
                  <RotateCw v-else />
                  {{ retrying ? 'Trying again…' : 'Try again' }}
                </Button>
                <Button v-if="originalLink" variant="outline" size="sm" as-child>
                  <a :href="originalLink" target="_blank" rel="noopener noreferrer">
                    Read on {{ host || 'the publisher' }}
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            </div>

            <div
              v-if="summaryOpen"
              class="mb-4 rounded-lg border bg-muted/40 px-4 py-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles class="size-4 text-primary" />
                  Summary
                  <Badge
                    v-if="summary?.engine"
                    variant="secondary"
                    class="text-[10px] uppercase"
                  >
                    {{ summary.engine }}
                  </Badge>
                </p>
                <div class="flex items-center gap-1">
                  <Button
                    v-if="summary?.summary && mounted && speech.supported.value"
                    variant="ghost"
                    size="sm"
                    :aria-label="
                      speech.speaking.value ? 'Pause the summary' : 'Listen to the summary'
                    "
                    @click="listen('summary')"
                  >
                    <Pause v-if="speech.speaking.value && !speech.paused.value" />
                    <Play v-else-if="speech.paused.value" />
                    <Headphones v-else />
                    <span class="hidden sm:inline">
                      {{ speech.speaking.value ? 'Pause' : 'Listen' }}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close the summary"
                    @click="summaryOpen = false"
                  >
                    <Square />
                  </Button>
                </div>
              </div>

              <p v-if="summaryLoading" class="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 class="size-4 animate-spin" />
                Reading the story and condensing it…
              </p>
              <p v-else-if="summaryError" class="mt-2 text-sm text-destructive">
                {{ summaryError }}
              </p>
              <p v-else-if="summary?.summary" class="mt-2 text-[14.5px] leading-relaxed">
                {{ summary.summary }}
              </p>
            </div>

            <div :class="proseClasses" v-html="article.html" />
          </template>
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
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-lg font-bold tracking-tight">
                {{ translation.title || article.title }}
              </h2>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="outline" size="sm" :disabled="!!exporting">
                    <Download />
                    {{ exporting ? 'Exporting…' : 'خروجی ترجمه' }}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @select="download('html', 'fa')">
                    <FileCode />
                    HTML
                  </DropdownMenuItem>
                  <DropdownMenuItem @select="download('md', 'fa')">
                    <FileText />
                    Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem @select="download('txt', 'fa')">
                    <FileType />
                    Plain text
                  </DropdownMenuItem>
                  <DropdownMenuItem @select="exportPdf('fa')">
                    <Printer />
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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

    <section v-if="user" class="mt-4 rounded-xl border bg-card">
      <div class="border-b px-4 py-3">
        <h2 class="text-sm font-semibold">{{ t('annotations.title') }}</h2>
      </div>

      <div class="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <p
            class="mb-2 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
          >
            {{ t('annotations.tags') }}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <Badge v-for="tag in tags" :key="tag" variant="secondary" class="gap-1">
              {{ tag }}
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground"
                :aria-label="`${t('annotations.remove')} ${tag}`"
                @click="removeTag(tag)"
              >
                ×
              </button>
            </Badge>
          </div>
          <div class="mt-2 flex gap-2">
            <Input
              v-model="tagInput"
              :placeholder="t('annotations.tagsPlaceholder')"
              class="h-8"
              @keydown.enter.prevent="addTag"
            />
            <Button variant="outline" size="sm" @click="addTag">
              <Tag />
              {{ t('action.add') }}
            </Button>
          </div>
        </div>

        <div>
          <p
            class="mb-2 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
          >
            {{ t('annotations.note') }}
          </p>
          <textarea
            v-model="note"
            :placeholder="t('annotations.notePlaceholder')"
            class="min-h-[86px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
          <div class="mt-2 flex items-center gap-2">
            <Button size="sm" :disabled="noteSaving" @click="saveNote">
              {{ noteSaving ? t('action.loading') : t('action.save') }}
            </Button>
            <span v-if="noteSaved" class="text-xs text-primary">
              {{ t('annotations.saved') }}
            </span>
          </div>
        </div>
      </div>

      <div class="border-t p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p
            class="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
          >
            {{ t('annotations.highlights') }}
          </p>
          <Button variant="outline" size="sm" @click="addHighlight">
            <Highlighter />
            {{ t('annotations.addHighlight') }}
          </Button>
        </div>
        <Input
          v-model="highlightNote"
          :placeholder="t('annotations.notePlaceholder')"
          class="mt-2 h-8"
        />
        <p v-if="highlightError" class="mt-2 text-xs text-destructive">
          {{ highlightError }}
        </p>
        <ul v-if="highlights.length" class="mt-3 flex flex-col gap-2">
          <li
            v-for="entry in highlights"
            :key="entry.id"
            class="rounded-lg border bg-background p-3"
          >
            <blockquote class="border-l-2 border-primary/60 pl-3 text-sm italic">
              {{ entry.quote }}
            </blockquote>
            <p v-if="entry.note" class="mt-1 text-xs text-muted-foreground">
              {{ entry.note }}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              class="mt-1"
              :aria-label="t('annotations.remove')"
              @click="removeHighlight(entry.id)"
            >
              <Trash2 />
            </Button>
          </li>
        </ul>
        <p v-else class="mt-3 text-xs text-muted-foreground">
          {{ t('annotations.noHighlights') }}
        </p>
      </div>
    </section>

    <section v-if="related.length" class="mt-4 rounded-xl border bg-card">
      <div class="flex items-center justify-between border-b px-4 py-3">
        <h2 class="text-sm font-semibold">Related stories</h2>
        <Badge variant="secondary">by similarity</Badge>
      </div>
      <ul class="divide-y">
        <li v-for="entry in related" :key="entry.id">
          <NuxtLink
            :to="`/item/${entry.id}`"
            class="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/60"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm leading-snug font-medium">{{ entry.title }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
                <span class="max-w-[14rem] truncate">{{ entry.feed_title }}</span>
                <span v-if="entry.published_at">{{ timeAgo(entry.published_at) }}</span>
                <span v-if="entry.readers > 0" class="inline-flex items-center gap-1">
                  <Eye class="size-3" />
                  <span class="tabular-nums">{{ entry.readers }}</span>
                </span>
              </p>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <p class="mt-4 text-center text-[11.5px] text-muted-foreground">
      Saved once and shared across everyone who reads this story.
    </p>
  </div>
</template>
