<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Activity,
  ArrowLeft,
  Download,
  Eraser,
  ExternalLink,
  FileText,
  Gauge,
  Globe,
  Languages,
  Loader2,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserCog,
  Users,
  Wrench,
} from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hostOf } from '@/utils/format.js';
import { cn } from '@/lib/utils';

definePageMeta({ middleware: ['auth', 'admin'] });
useSeoMeta({ robots: 'noindex,nofollow' });
useHead({ title: 'Admin · Feedwire' });

const { user } = useAuth();

const tab = ref('overview');
const overview = ref(null);
const users = ref([]);
const feeds = ref([]);
const content = ref([]);
const translations = ref([]);
const audit = ref([]);

const userQuery = ref('');
const feedQuery = ref('');
const contentQuery = ref('');
const translationQuery = ref('');

const loadingOverview = ref(true);
const loadingUsers = ref(true);
const loadingFeeds = ref(true);
const loadingContent = ref(true);
const loadingTranslations = ref(true);

const busyId = ref(null);
const busyTool = ref(null);
const notice = ref(null);
const newFeedUrl = ref('');
const addingFeed = ref(false);

let noticeTimer = null;
let userTimer = null;
let feedTimer = null;
let contentTimer = null;
let translationTimer = null;
let pollTimer = null;

function notify(message, type = 'info') {
  notice.value = { message, type };
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
  }, 4400);
}

function errorMessage(error) {
  return error?.data?.error ?? error?.message ?? 'Something went wrong';
}

/* ------------------------------------------------------------------ load */

async function loadOverview() {
  try {
    overview.value = await $fetch('/api/admin/overview');
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    loadingOverview.value = false;
    schedulePoll();
  }
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const data = await $fetch('/api/admin/users', {
      query: { q: userQuery.value.trim() },
    });
    users.value = data.users;
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    loadingUsers.value = false;
  }
}

async function loadFeeds({ silent = false } = {}) {
  if (!silent) loadingFeeds.value = true;
  try {
    const data = await $fetch('/api/admin/feeds', {
      query: { q: feedQuery.value.trim() },
    });
    feeds.value = data.feeds;
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    if (!silent) loadingFeeds.value = false;
  }
}

async function loadContent({ silent = false } = {}) {
  if (!silent) loadingContent.value = true;
  try {
    const data = await $fetch('/api/admin/content', {
      query: { q: contentQuery.value.trim() },
    });
    content.value = data.items;
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    if (!silent) loadingContent.value = false;
  }
}

async function loadTranslations() {
  loadingTranslations.value = true;
  try {
    const data = await $fetch('/api/admin/translations', {
      query: { q: translationQuery.value.trim() },
    });
    translations.value = data.translations;
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    loadingTranslations.value = false;
  }
}

async function loadAudit() {
  try {
    const data = await $fetch('/api/admin/audit', { query: { limit: 60 } });
    audit.value = data.entries;
  } catch {
    /* the audit panel is optional chrome */
  }
}

watch(userQuery, () => {
  clearTimeout(userTimer);
  userTimer = setTimeout(loadUsers, 250);
});

watch(feedQuery, () => {
  clearTimeout(feedTimer);
  feedTimer = setTimeout(loadFeeds, 250);
});

watch(contentQuery, () => {
  clearTimeout(contentTimer);
  contentTimer = setTimeout(loadContent, 250);
});

watch(translationQuery, () => {
  clearTimeout(translationTimer);
  translationTimer = setTimeout(loadTranslations, 250);
});
watch(tab, (value) => {
  if (value === 'content' && loadingContent.value) loadContent();
  if (value === 'system') loadAudit();
});

/** While a background job runs the dashboard keeps its counters fresh. */
function schedulePoll() {
  clearTimeout(pollTimer);
  const jobs = overview.value?.jobs;
  if (!jobs) return;
  const running = Object.values(jobs).some((job) => job.running);
  if (!running) return;
  pollTimer = setTimeout(async () => {
    await Promise.all([
      loadOverview(),
      loadFeeds({ silent: true }),
      loadContent({ silent: true }),
    ]);
  }, 2500);
}

/* --------------------------------------------------------------- actions */

async function runMaintenance(action, { confirm, only } = {}) {
  if (confirm && !window.confirm(confirm)) return;
  busyTool.value = action;
  try {
    const data = await $fetch('/api/admin/maintenance', {
      method: 'POST',
      body: { action, only },
    });
    notify(describeMaintenance(action, data.result));
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyTool.value = null;
    await Promise.all([loadOverview(), loadFeeds(), loadContent()]);
  }
}

function describeMaintenance(action, result) {
  switch (action) {
    case 'reindex':
      return 'Embeddings reset — re-indexing in the background';
    case 'reclassify':
      if (result?.started === false) return 'A re-classification is already running';
      return `Re-classifying ${result?.queued ?? 0} stories in the background`;
    case 'repair-links':
      return `Repaired ${result?.repaired ?? 0} link(s), cleared ${result?.cleared ?? 0} notice page(s)`;
    case 'clear-cache':
      return result?.ok
        ? `Cache flushed (${result.keys} key${result.keys === 1 ? '' : 's'})`
        : 'Redis is not reachable';
    case 'refresh-feeds':
      if (result?.started === false) return 'A refresh is already running';
      return result?.queued
        ? `Refreshing ${result.queued} feed(s) in the background`
        : 'No feeds needed a refresh';
    case 'retry-content':
      if (result?.started === false) return 'A retry is already running';
      return result?.queued
        ? `Re-downloading ${result.queued} article(s)`
        : 'Nothing is waiting for a retry';
    case 'prune-sessions':
      return 'Expired sessions and reset tokens pruned';
    default:
      return 'Done';
  }
}

async function runScheduler(action) {
  busyTool.value = `scheduler:${action}`;
  try {
    const data = await $fetch('/api/admin/scheduler', {
      method: 'POST',
      body: { action },
    });
    if (action === 'run') {
      notify(
        data.refreshed
          ? `Scheduler refreshed ${data.refreshed} feed(s)`
          : 'Scheduler pass finished — nothing due'
      );
    } else {
      notify(action === 'resume' ? 'Feed polling resumed' : 'Feed polling paused');
    }
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyTool.value = null;
    await loadOverview();
  }
}

async function toggleRole(entry) {
  const next = entry.role === 'admin' ? 'user' : 'admin';
  busyId.value = entry.id;
  try {
    await $fetch(`/api/admin/users/${entry.id}`, {
      method: 'PATCH',
      body: { role: next },
    });
    notify(
      next === 'admin'
        ? `${entry.email} is now an admin`
        : `${entry.email} is now a reader`
    );
    await Promise.all([loadUsers(), loadOverview(), loadAudit()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyId.value = null;
  }
}

async function removeUser(entry) {
  if (!window.confirm(`Delete ${entry.email} and all of their data?`)) return;
  busyId.value = entry.id;
  try {
    await $fetch(`/api/admin/users/${entry.id}`, { method: 'DELETE' });
    notify(`Deleted ${entry.email}`);
    await Promise.all([loadUsers(), loadOverview(), loadAudit()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyId.value = null;
  }
}

async function revokeSessions(entry) {
  if (!window.confirm(`Sign ${entry.email} out of every device?`)) return;
  busyId.value = entry.id;
  try {
    const data = await $fetch(`/api/admin/users/${entry.id}/sessions`, {
      method: 'DELETE',
    });
    notify(`Signed out ${data.revoked} session(s) for ${entry.email}`);
    await Promise.all([loadUsers(), loadOverview(), loadAudit()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyId.value = null;
  }
}

async function refreshFeed(feed) {
  busyId.value = feed.id;
  try {
    const data = await $fetch(`/api/admin/feeds/${feed.id}/refresh`, {
      method: 'POST',
    });
    if (data.result?.error) {
      notify(data.result.error, 'error');
    } else {
      notify(
        data.result?.inserted
          ? `${feed.title || hostOf(feed.url)}: ${data.result.inserted} new items`
          : `${feed.title || hostOf(feed.url)}: up to date`
      );
    }
    await Promise.all([loadFeeds(), loadOverview()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyId.value = null;
  }
}

async function toggleFeedVisibility(feed) {
  busyId.value = feed.id;
  try {
    await $fetch(`/api/admin/feeds/${feed.id}`, {
      method: 'PATCH',
      body: { is_public: !feed.is_public },
    });
    notify(
      feed.is_public
        ? `${feed.title || hostOf(feed.url)} is no longer on the public page`
        : `${feed.title || hostOf(feed.url)} is now public`
    );
    await Promise.all([loadFeeds(), loadOverview(), loadAudit()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyId.value = null;
  }
}

async function removeFeed(feed) {
  if (
    !window.confirm(
      `Delete "${feed.title || hostOf(feed.url)}" and its ${feed.item_count} stories for every subscriber?`
    )
  ) {
    return;
  }
  busyId.value = feed.id;
  try {
    await $fetch(`/api/admin/feeds/${feed.id}`, { method: 'DELETE' });
    notify('Feed deleted');
    await Promise.all([loadFeeds(), loadOverview(), loadAudit()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyId.value = null;
  }
}

async function addFeed() {
  const url = newFeedUrl.value.trim();
  if (!url) return;
  addingFeed.value = true;
  try {
    const data = await $fetch('/api/admin/feeds', {
      method: 'POST',
      body: { url },
    });
    const name = data.feed?.title || hostOf(data.feed?.url || url);
    if (!data.created) {
      notify(`${name} was already in the shared list`);
    } else if (data.result?.error) {
      notify(`${name} added, but the first fetch failed: ${data.result.error}`, 'error');
    } else {
      notify(
        `${name} added${data.result?.inserted ? ` — ${data.result.inserted} stories` : ''}`
      );
    }
    newFeedUrl.value = '';
    await Promise.all([loadFeeds(), loadOverview(), loadAudit()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    addingFeed.value = false;
  }
}

async function retryItem(entry) {
  busyId.value = entry.id;
  try {
    const data = await $fetch(`/api/admin/content/${entry.id}/retry`, {
      method: 'POST',
    });
    if (data.result?.error) notify(data.result.error, 'error');
    else if (data.result?.partial) notify('Only the feed summary was available', 'info');
    else notify('Article downloaded');
    await Promise.all([loadContent(), loadOverview(), loadAudit()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyId.value = null;
  }
}

async function deleteTranslation(entry) {
  busyId.value = `t:${entry.itemId}:${entry.lang}`;
  try {
    await $fetch('/api/admin/translations', {
      method: 'DELETE',
      body: { itemId: entry.itemId, lang: entry.lang },
    });
    notify('Translation dropped — it rebuilds on the next request');
    await Promise.all([loadTranslations(), loadOverview(), loadAudit()]);
  } catch (error) {
    notify(errorMessage(error), 'error');
  } finally {
    busyId.value = null;
  }
}

/* -------------------------------------------------------------- helpers */

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(value) {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function actionLabel(action) {
  return String(action ?? '').replace(/[:-]/g, ' ');
}

const indexPercent = computed(() => {
  const index = overview.value?.index;
  if (!index?.total) return 100;
  return Math.round((index.embedded / index.total) * 100);
});

const bodyPercent = computed(() => {
  const index = overview.value?.index;
  if (!index?.contentTotal) return 100;
  return Math.round((index.contentEmbedded / index.contentTotal) * 100);
});

const stats = computed(() => {
  const counts = overview.value?.counts;
  if (!counts) return [];
  return [
    { label: 'Users', value: counts.users, hint: `${counts.admins} admin` },
    { label: 'Feeds', value: counts.feeds, hint: `${counts.public_feeds} public` },
    { label: 'Subscriptions', value: counts.subscriptions, hint: 'user ↔ feed' },
    { label: 'Stories', value: counts.items, hint: `${counts.items_with_content} read here` },
    { label: 'Read', value: counts.reads, hint: `${counts.favorites} favourites` },
    { label: 'Translations', value: counts.translations, hint: 'shared rows' },
    {
      label: 'Sessions',
      value: counts.sessions,
      hint: `${counts.session_users} accounts · ${counts.expired_sessions} expired`,
    },
    {
      label: 'Feed errors',
      value: counts.failing_feeds,
      hint: `${counts.never_fetched} never fetched`,
    },
  ];
});

const activeJobs = computed(() => {
  const jobs = overview.value?.jobs;
  if (!jobs) return [];
  return Object.entries(jobs)
    .filter(([, job]) => job.running)
    .map(([name, job]) => ({ name, ...job }));
});

const system = computed(() => overview.value?.system ?? null);

onMounted(() => {
  loadOverview();
  loadUsers();
  loadFeeds();
  loadContent();
  loadTranslations();
  loadAudit();
});

onBeforeUnmount(() => {
  clearTimeout(noticeTimer);
  clearTimeout(userTimer);
  clearTimeout(feedTimer);
  clearTimeout(contentTimer);
  clearTimeout(translationTimer);
  clearTimeout(pollTimer);
});
</script>

<template>
  <div class="mx-auto max-w-[1180px] px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8">
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p
          class="mb-1.5 inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground"
        >
          <ShieldCheck class="size-3 text-primary" />
          Operator area
        </p>
        <h1 class="text-2xl font-bold tracking-tight">Admin dashboard</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Accounts, feeds, content health and the indexing pipeline in one place.
        </p>
      </div>
      <Button variant="outline" size="sm" as-child>
        <NuxtLink to="/reader">
          <ArrowLeft />
          Back to reader
        </NuxtLink>
      </Button>
    </header>

    <div
      v-if="activeJobs.length"
      class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm"
    >
      <Loader2 class="size-4 animate-spin text-primary" />
      <span
        v-for="job in activeJobs"
        :key="job.name"
        class="text-muted-foreground tabular-nums"
      >
        <span class="font-medium text-foreground">{{ actionLabel(job.name) }}</span>
        {{ job.done }}/{{ job.total }}
        <span v-if="job.failed" class="text-destructive">({{ job.failed }} failed)</span>
      </span>
    </div>

    <Tabs v-model="tab" default-value="overview">
      <TabsList class="mb-5 h-auto w-full flex-wrap justify-center gap-1 sm:w-fit sm:justify-start">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="feeds">Feeds</TabsTrigger>
        <TabsTrigger value="content">Content</TabsTrigger>
        <TabsTrigger value="system">System</TabsTrigger>
      </TabsList>

      <!-- ------------------------------------------------------ overview -->
      <TabsContent value="overview" class="space-y-4">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="stat in stats"
            :key="stat.label"
            class="rounded-xl border bg-card p-4"
          >
            <p class="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
              {{ stat.label }}
            </p>
            <p class="mt-1 text-2xl font-bold tabular-nums">{{ stat.value ?? '—' }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ stat.hint }}</p>
          </div>
          <div
            v-if="loadingOverview"
            class="col-span-2 flex items-center gap-2 text-sm text-muted-foreground sm:col-span-4"
          >
            <Loader2 class="size-4 animate-spin" />
            Loading totals…
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="rounded-xl border bg-card p-4 sm:p-5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="text-sm font-semibold">Embedding pipeline</h2>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ overview?.index?.model || 'Model loading' }} · dot-product vectors
                </p>
              </div>
              <Badge variant="secondary" class="tabular-nums">{{ indexPercent }}%</Badge>
            </div>
            <dl class="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt class="text-xs text-muted-foreground">Headlines</dt>
                <dd class="tabular-nums">
                  <span class="font-medium">{{ overview?.index?.embedded ?? 0 }}</span>
                  / {{ overview?.index?.total ?? 0 }}
                  <span class="text-xs text-muted-foreground">
                    ({{ overview?.index?.pending ?? 0 }} pending)
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Full articles · {{ bodyPercent }}%</dt>
                <dd class="tabular-nums">
                  <span class="font-medium">{{ overview?.index?.contentEmbedded ?? 0 }}</span>
                  / {{ overview?.index?.contentTotal ?? 0 }}
                  <span class="text-xs text-muted-foreground">
                    ({{ overview?.index?.contentPending ?? 0 }} pending)
                  </span>
                </dd>
              </div>
            </dl>
            <p v-if="overview?.index?.error" class="mt-2 text-xs text-destructive">
              {{ overview.index.error }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="busyTool === 'reclassify'"
                @click="runMaintenance('reclassify')"
              >
                <Sparkles :class="cn(busyTool === 'reclassify' && 'animate-spin')" />
                Re-classify topics
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="busyTool === 'reindex'"
                @click="
                  runMaintenance('reindex', {
                    confirm:
                      'Reset every embedding and re-index all stories? This runs in the background.',
                  })
                "
              >
                <RotateCcw :class="cn(busyTool === 'reindex' && 'animate-spin')" />
                Reset &amp; re-index
              </Button>
            </div>
          </section>

          <section class="rounded-xl border bg-card p-4 sm:p-5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="text-sm font-semibold">Feed scheduler</h2>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Polls each feed on its subscribers' fastest interval.
                </p>
              </div>
              <Badge :variant="overview?.scheduler?.enabled ? 'secondary' : 'outline'">
                {{ overview?.scheduler?.enabled ? 'running' : 'paused' }}
              </Badge>
            </div>
            <p class="mt-3 text-sm text-muted-foreground">
              Last pass:
              <span class="text-foreground">
                {{
                  overview?.scheduler?.lastRunAt
                    ? formatDateTime(overview.scheduler.lastRunAt)
                    : 'not yet'
                }}
              </span>
              ·
              <span class="tabular-nums">{{ overview?.scheduler?.lastRefreshed ?? 0 }}</span>
              feed(s)
            </p>
            <p v-if="overview?.scheduler?.lastError" class="mt-1 text-xs text-destructive">
              {{ overview.scheduler.lastError }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="busyTool === 'scheduler:run'"
                @click="runScheduler('run')"
              >
                <Play :class="cn(busyTool === 'scheduler:run' && 'animate-pulse')" />
                Run a pass now
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="busyTool?.startsWith('scheduler:')"
                @click="runScheduler(overview?.scheduler?.enabled ? 'pause' : 'resume')"
              >
                <Pause v-if="overview?.scheduler?.enabled" />
                <Play v-else />
                {{ overview?.scheduler?.enabled ? 'Pause polling' : 'Resume polling' }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :disabled="busyTool === 'prune-sessions'"
                @click="runMaintenance('prune-sessions')"
              >
                <Eraser />
                Prune sessions
              </Button>
            </div>
          </section>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="rounded-xl border bg-card p-4 sm:p-5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="text-sm font-semibold">Article library</h2>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Bodies downloaded once, then shared by every reader.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                :disabled="busyTool === 'retry-content'"
                @click="runMaintenance('retry-content')"
              >
                <RefreshCw :class="cn(busyTool === 'retry-content' && 'animate-spin')" />
                Retry failures
              </Button>
            </div>
            <dl class="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt class="text-xs text-muted-foreground">Full</dt>
                <dd class="font-medium tabular-nums">{{ overview?.content?.full ?? 0 }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Preview only</dt>
                <dd class="font-medium tabular-nums">{{ overview?.content?.partial ?? 0 }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Failed</dt>
                <dd class="font-medium tabular-nums">{{ overview?.content?.failed ?? 0 }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Blocked</dt>
                <dd class="font-medium tabular-nums">{{ overview?.content?.blocked ?? 0 }}</dd>
              </div>
            </dl>
            <div class="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
              <TriangleAlert class="size-3.5 text-muted-foreground" />
              <span class="text-muted-foreground">
                Broken links
                <span class="tabular-nums text-foreground">
                  {{ overview?.brokenLinks?.wrapped ?? 0 }}
                </span>
                · notice pages
                <span class="tabular-nums text-foreground">
                  {{ overview?.brokenLinks?.notices ?? 0 }}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                class="ml-auto"
                :disabled="busyTool === 'repair-links'"
                @click="runMaintenance('repair-links')"
              >
                <Wrench :class="cn(busyTool === 'repair-links' && 'animate-spin')" />
                Repair links
              </Button>
            </div>
          </section>

          <section class="rounded-xl border bg-card">
            <div class="flex items-center justify-between border-b px-4 py-3">
              <h2 class="flex items-center gap-1.5 text-sm font-semibold">
                <Activity class="size-4 text-muted-foreground" />
                Last 7 days
              </h2>
              <Badge variant="secondary">activity</Badge>
            </div>
            <ul class="divide-y">
              <li
                v-for="day in overview?.activity ?? []"
                :key="day.day"
                class="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span class="flex-1 text-muted-foreground">{{ formatDay(day.day) }}</span>
                <Badge variant="secondary" class="tabular-nums">
                  {{ day.items }} stories
                </Badge>
                <span class="text-xs text-muted-foreground tabular-nums">
                  {{ day.accounts }} accounts · {{ day.translations }} translations
                </span>
              </li>
              <li
                v-if="!overview?.activity?.length"
                class="px-4 py-6 text-center text-sm text-muted-foreground"
              >
                No activity recorded yet.
              </li>
            </ul>
          </section>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="rounded-xl border bg-card">
            <div class="border-b px-4 py-3">
              <h2 class="flex items-center gap-1.5 text-sm font-semibold">
                <Users class="size-4 text-muted-foreground" />
                Newest accounts
              </h2>
            </div>
            <ul class="divide-y">
              <li
                v-for="entry in overview?.recentUsers ?? []"
                :key="entry.id"
                class="flex items-center gap-2 px-4 py-2.5"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">
                    {{ entry.displayName || entry.email }}
                  </p>
                  <p class="truncate text-xs text-muted-foreground">{{ entry.email }}</p>
                </div>
                <Badge v-if="entry.role === 'admin'" variant="secondary" class="text-[11px]">
                  admin
                </Badge>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {{ formatDate(entry.createdAt) }}
                </span>
              </li>
              <li
                v-if="!overview?.recentUsers?.length"
                class="px-4 py-6 text-center text-sm text-muted-foreground"
              >
                No accounts yet.
              </li>
            </ul>
          </section>

          <section class="rounded-xl border bg-card">
            <div class="flex items-center justify-between border-b px-4 py-3">
              <h2 class="flex items-center gap-1.5 text-sm font-semibold">
                <TriangleAlert class="size-4 text-destructive" />
                Feeds with errors
              </h2>
              <Button
                variant="outline"
                size="sm"
                :disabled="busyTool === 'refresh-feeds'"
                @click="runMaintenance('refresh-feeds', { only: 'failing' })"
              >
                <RefreshCw :class="cn(busyTool === 'refresh-feeds' && 'animate-spin')" />
                Retry all
              </Button>
            </div>
            <ul class="divide-y">
              <li
                v-for="feed in overview?.failingFeeds ?? []"
                :key="feed.id"
                class="flex items-start gap-2 px-4 py-2.5"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">
                    {{ feed.title || hostOf(feed.url) }}
                  </p>
                  <p class="truncate text-xs text-destructive">{{ feed.last_error }}</p>
                  <p class="text-[11px] text-muted-foreground">
                    {{ feed.subscriber_count }} subscriber(s) · last try
                    {{ formatDateTime(feed.last_attempt_at || feed.last_fetched_at) }}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="busyId === feed.id"
                  aria-label="Refresh feed"
                  @click="refreshFeed(feed)"
                >
                  <RefreshCw :class="cn(busyId === feed.id && 'animate-spin')" />
                </Button>
              </li>
              <li
                v-if="!overview?.failingFeeds?.length"
                class="px-4 py-6 text-center text-sm text-muted-foreground"
              >
                Every feed is fetching cleanly.
              </li>
            </ul>
          </section>
        </div>

        <section class="rounded-xl border bg-card">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <h2 class="flex items-center gap-1.5 text-sm font-semibold">
              <Gauge class="size-4 text-muted-foreground" />
              Recent operator activity
            </h2>
            <Button variant="ghost" size="sm" @click="tab = 'system'">Full log</Button>
          </div>
          <ul class="divide-y">
            <li
              v-for="entry in overview?.audit ?? []"
              :key="entry.id"
              class="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm"
            >
              <span class="font-medium">{{ actionLabel(entry.action) }}</span>
              <span class="text-xs text-muted-foreground">{{ entry.actor }}</span>
              <span v-if="entry.target" class="truncate text-xs text-muted-foreground">
                {{ entry.target }}
              </span>
              <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                {{ formatDateTime(entry.createdAt) }}
              </span>
            </li>
            <li
              v-if="!overview?.audit?.length"
              class="px-4 py-6 text-center text-sm text-muted-foreground"
            >
              Nothing recorded yet.
            </li>
          </ul>
        </section>
      </TabsContent>

      <!-- --------------------------------------------------------- users -->
      <TabsContent value="users" class="space-y-4">
        <div class="relative flex items-center">
          <Search
            class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            v-model="userQuery"
            type="search"
            placeholder="Search accounts by email or name"
            aria-label="Search accounts"
            class="h-9 pl-8 text-sm"
          />
        </div>

        <section class="rounded-xl border bg-card">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <h2 class="text-sm font-semibold">Accounts</h2>
            <Badge variant="secondary" class="tabular-nums">{{ users.length }}</Badge>
          </div>
          <ul class="divide-y">
            <li
              v-for="entry in users"
              :key="entry.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div class="min-w-0 flex-1 basis-48">
                <p class="flex items-center gap-2 truncate text-sm font-medium">
                  {{ entry.displayName || entry.email }}
                  <Badge
                    :variant="entry.role === 'admin' ? 'default' : 'secondary'"
                    class="text-[11px]"
                  >
                    {{ entry.role }}
                  </Badge>
                  <span v-if="entry.id === user?.id" class="text-[11px] text-muted-foreground">
                    you
                  </span>
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ entry.email }} · joined {{ formatDate(entry.createdAt) }}
                </p>
                <p v-if="entry.lastSessionAt" class="text-[11px] text-muted-foreground">
                  last sign-in {{ formatDateTime(entry.lastSessionAt) }}
                </p>
              </div>

              <dl class="flex items-center gap-3 text-xs text-muted-foreground">
                <div class="text-center">
                  <dt class="text-[10px] uppercase">Feeds</dt>
                  <dd class="tabular-nums text-foreground">{{ entry.feedCount }}</dd>
                </div>
                <div class="text-center">
                  <dt class="text-[10px] uppercase">Read</dt>
                  <dd class="tabular-nums text-foreground">{{ entry.readCount }}</dd>
                </div>
                <div class="text-center">
                  <dt class="text-[10px] uppercase">Stars</dt>
                  <dd class="tabular-nums text-foreground">{{ entry.favoriteCount }}</dd>
                </div>
              </dl>

              <div class="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="busyId === entry.id || entry.id === user?.id"
                  @click="toggleRole(entry)"
                >
                  <UserCog />
                  <span class="hidden sm:inline">
                    {{ entry.role === 'admin' ? 'Make reader' : 'Make admin' }}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="busyId === entry.id || entry.id === user?.id"
                  aria-label="Sign out everywhere"
                  @click="revokeSessions(entry)"
                >
                  <LogOut />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="hover:text-destructive"
                  :disabled="busyId === entry.id || entry.id === user?.id"
                  aria-label="Delete account"
                  @click="removeUser(entry)"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
            <li
              v-if="!loadingUsers && !users.length"
              class="px-4 py-6 text-center text-sm text-muted-foreground"
            >
              No accounts match your search.
            </li>
            <li
              v-if="loadingUsers"
              class="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
            >
              <Loader2 class="size-4 animate-spin" />
              Loading accounts…
            </li>
          </ul>
        </section>
      </TabsContent>

      <!-- --------------------------------------------------------- feeds -->
      <TabsContent value="feeds" class="space-y-4">
        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">Add a shared feed</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Paste a feed URL or a site address. The story and its vectors are stored once and
            shared by every subscriber; use the globe icon to publish it.
          </p>
          <form class="mt-3 flex flex-col gap-2 sm:flex-row" @submit.prevent="addFeed">
            <Input
              v-model="newFeedUrl"
              type="url"
              placeholder="https://example.com/feed"
              aria-label="New feed URL"
              class="h-9 text-sm"
              :disabled="addingFeed"
            />
            <Button type="submit" size="sm" class="h-9 shrink-0" :disabled="addingFeed || !newFeedUrl.trim()">
              <Loader2 v-if="addingFeed" class="animate-spin" />
              <Plus v-else />
              Add feed
            </Button>
          </form>
        </section>

        <div class="relative flex items-center">
          <Search
            class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            v-model="feedQuery"
            type="search"
            placeholder="Search feeds by title or URL"
            aria-label="Search feeds"
            class="h-9 pl-8 text-sm"
          />
        </div>

        <section class="rounded-xl border bg-card">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 class="text-sm font-semibold">
              Shared feeds
              <span class="ml-1 text-muted-foreground tabular-nums">({{ feeds.length }})</span>
            </h2>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="busyTool === 'refresh-feeds'"
                @click="runMaintenance('refresh-feeds', { only: 'failing' })"
              >
                <RefreshCw :class="cn(busyTool === 'refresh-feeds' && 'animate-spin')" />
                Failing only
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="busyTool === 'refresh-feeds'"
                @click="runMaintenance('refresh-feeds')"
              >
                <RefreshCw />
                Refresh all
              </Button>
            </div>
          </div>
          <ul class="divide-y">
            <li
              v-for="feed in feeds"
              :key="feed.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div class="min-w-0 flex-1 basis-48">
                <p class="flex items-center gap-2 truncate text-sm font-medium">
                  {{ feed.title || hostOf(feed.url) }}
                  <Badge v-if="feed.is_public" variant="secondary" class="text-[11px]">
                    public
                  </Badge>
                  <Badge v-else-if="feed.last_error" variant="destructive" class="text-[11px]">
                    error
                  </Badge>
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ hostOf(feed.url) }} · last try
                  {{ formatDateTime(feed.last_attempt_at || feed.last_fetched_at) }}
                  <template v-if="feed.min_interval_minutes">
                    · every {{ feed.min_interval_minutes }}m
                  </template>
                </p>
                <p v-if="feed.last_error" class="truncate text-xs text-destructive">
                  {{ feed.last_error }}
                </p>
              </div>

              <dl class="flex items-center gap-3 text-xs text-muted-foreground">
                <div class="text-center">
                  <dt class="text-[10px] uppercase">Subs</dt>
                  <dd class="tabular-nums text-foreground">{{ feed.subscriber_count }}</dd>
                </div>
                <div class="text-center">
                  <dt class="text-[10px] uppercase">Stories</dt>
                  <dd class="tabular-nums text-foreground">{{ feed.item_count }}</dd>
                </div>
              </dl>

              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="busyId === feed.id"
                  :aria-label="feed.is_public ? 'Remove from public page' : 'Make public'"
                  @click="toggleFeedVisibility(feed)"
                >
                  <Globe :class="cn(feed.is_public && 'text-primary')" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="busyId === feed.id"
                  aria-label="Refresh feed"
                  @click="refreshFeed(feed)"
                >
                  <RefreshCw :class="cn(busyId === feed.id && 'animate-spin')" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="hover:text-destructive"
                  :disabled="busyId === feed.id || feed.is_public"
                  aria-label="Delete feed"
                  @click="removeFeed(feed)"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
            <li
              v-if="!loadingFeeds && !feeds.length"
              class="px-4 py-6 text-center text-sm text-muted-foreground"
            >
              No feeds match your search.
            </li>
            <li
              v-if="loadingFeeds"
              class="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
            >
              <Loader2 class="size-4 animate-spin" />
              Loading feeds…
            </li>
          </ul>
        </section>
      </TabsContent>

      <!-- ------------------------------------------------------- content -->
      <TabsContent value="content" class="space-y-4">
        <section class="rounded-xl border bg-card">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 class="text-sm font-semibold">Failed downloads</h2>
              <p class="mt-0.5 text-xs text-muted-foreground">
                Stories that fell back to a summary preview or a publisher block.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="busyTool === 'retry-content'"
              @click="runMaintenance('retry-content')"
            >
              <RefreshCw :class="cn(busyTool === 'retry-content' && 'animate-spin')" />
              Retry next 6
            </Button>
          </div>

          <div class="relative flex items-center border-b px-4 py-3">
            <Search
              class="pointer-events-none absolute left-6 size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              v-model="contentQuery"
              type="search"
              placeholder="Search failures by title or message"
              aria-label="Search failures"
              class="h-9 pl-8 text-sm"
            />
          </div>

          <ul class="divide-y">
            <li
              v-for="entry in content"
              :key="entry.id"
              class="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div class="min-w-0 flex-1 basis-56">
                <p class="truncate text-sm font-medium">{{ entry.title }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ entry.feedTitle }} · {{ formatDateTime(entry.fetchedAt) }}
                </p>
                <p v-if="entry.error" class="truncate text-xs text-destructive">
                  {{ entry.error }}
                </p>
              </div>
              <Badge :variant="entry.partial ? 'secondary' : 'destructive'" class="text-[11px]">
                {{ entry.partial ? 'preview' : 'failed' }}
              </Badge>
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" as-child>
                  <a
                    :href="entry.link"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open original"
                  >
                    <ExternalLink />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="busyId === entry.id"
                  @click="retryItem(entry)"
                >
                  <Loader2 v-if="busyId === entry.id" class="animate-spin" />
                  <RefreshCw v-else />
                  <span class="hidden sm:inline">Retry</span>
                </Button>
              </div>
            </li>
            <li
              v-if="!loadingContent && !content.length"
              class="px-4 py-6 text-center text-sm text-muted-foreground"
            >
              Every opened story downloaded cleanly.
            </li>
            <li
              v-if="loadingContent"
              class="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
            >
              <Loader2 class="size-4 animate-spin" />
              Loading queue…
            </li>
          </ul>
        </section>

        <section class="rounded-xl border bg-card">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 class="flex items-center gap-1.5 text-sm font-semibold">
                <Languages class="size-4 text-muted-foreground" />
                Translations
              </h2>
              <p class="mt-0.5 text-xs text-muted-foreground">
                One row per story and language, shared by every reader.
              </p>
            </div>
            <div class="flex items-center gap-1.5">
              <Badge
                v-for="lang in overview?.translationsByLang ?? []"
                :key="lang.lang"
                variant="secondary"
                class="tabular-nums"
              >
                {{ lang.lang }} {{ lang.count }}
              </Badge>
            </div>
          </div>

          <div class="relative flex items-center border-b px-4 py-3">
            <Search
              class="pointer-events-none absolute left-6 size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              v-model="translationQuery"
              type="search"
              placeholder="Search translations by story title"
              aria-label="Search translations"
              class="h-9 pl-8 text-sm"
            />
          </div>

          <ul class="divide-y">
            <li
              v-for="entry in translations"
              :key="`${entry.itemId}:${entry.lang}`"
              class="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div class="min-w-0 flex-1 basis-56">
                <p class="truncate text-sm font-medium">{{ entry.itemTitle }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ formatDateTime(entry.createdAt) }} ·
                  <span class="tabular-nums">{{ entry.chars }}</span> characters
                </p>
                <p v-if="entry.error" class="truncate text-xs text-destructive">
                  {{ entry.error }}
                </p>
              </div>
              <Badge variant="outline" class="uppercase">{{ entry.lang }}</Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                class="hover:text-destructive"
                :disabled="busyId === `t:${entry.itemId}:${entry.lang}`"
                :aria-label="`Drop the ${entry.lang} translation`"
                @click="deleteTranslation(entry)"
              >
                <Trash2 />
              </Button>
            </li>
            <li
              v-if="!loadingTranslations && !translations.length"
              class="px-4 py-6 text-center text-sm text-muted-foreground"
            >
              No translations cached yet.
            </li>
            <li
              v-if="loadingTranslations"
              class="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
            >
              <Loader2 class="size-4 animate-spin" />
              Loading translations…
            </li>
          </ul>
        </section>
      </TabsContent>

      <!-- -------------------------------------------------------- system -->
      <TabsContent value="system" class="space-y-4">
        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">Runtime</h2>
          <dl class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt class="text-xs text-muted-foreground">Node</dt>
              <dd class="font-medium">{{ system?.node ?? '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Uptime</dt>
              <dd class="font-medium tabular-nums">{{ formatUptime(system?.uptimeSeconds) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Cache</dt>
              <dd class="flex items-center gap-1.5 font-medium">
                <Badge :variant="system?.cache === 'up' ? 'secondary' : 'destructive'">
                  {{ system?.cache ?? '—' }}
                </Badge>
                <span class="text-xs text-muted-foreground tabular-nums">
                  {{ system?.cacheKeys ?? 0 }} keys
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Database</dt>
              <dd class="font-medium tabular-nums">
                {{ formatBytes(system?.dbSizeBytes) }}
                <span class="text-xs text-muted-foreground">
                  {{ system?.tables ?? 0 }} tables
                </span>
              </dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs text-muted-foreground">Embedding model</dt>
              <dd class="truncate font-medium">
                {{ system?.model ?? '—' }}
                <span class="text-xs text-muted-foreground">
                  {{ system?.dimensions ?? 0 }} dimensions
                </span>
              </dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs text-muted-foreground">Public site URL</dt>
              <dd class="truncate font-medium">{{ system?.siteUrl ?? '—' }}</dd>
            </div>
          </dl>
        </section>

        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="flex items-center gap-1.5 text-sm font-semibold">
                <Wrench class="size-4 text-muted-foreground" />
                Maintenance
              </h2>
              <p class="mt-0.5 text-xs text-muted-foreground">
                Safe to press twice — each action is idempotent.
              </p>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="busyTool === 'reclassify'"
              @click="runMaintenance('reclassify')"
            >
              <Sparkles :class="cn(busyTool === 'reclassify' && 'animate-spin')" />
              Re-classify topics
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="busyTool === 'repair-links'"
              @click="runMaintenance('repair-links')"
            >
              <Wrench :class="cn(busyTool === 'repair-links' && 'animate-spin')" />
              Repair links
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="busyTool === 'prune-sessions'"
              @click="runMaintenance('prune-sessions')"
            >
              <Eraser />
              Prune expired sessions
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="busyTool === 'clear-cache'"
              @click="
                runMaintenance('clear-cache', { confirm: 'Flush the whole Redis cache?' })
              "
            >
              <Eraser :class="cn(busyTool === 'clear-cache' && 'animate-spin')" />
              Flush Redis cache
            </Button>
            <Button
              variant="destructive"
              size="sm"
              :disabled="busyTool === 'reindex'"
              @click="
                runMaintenance('reindex', {
                  confirm:
                    'Reset every embedding and re-index every story? Search degrades until the background worker finishes.',
                })
              "
            >
              <RotateCcw :class="cn(busyTool === 'reindex' && 'animate-spin')" />
              Reset &amp; re-index everything
            </Button>
          </div>
        </section>

        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="flex items-center gap-1.5 text-sm font-semibold">
            <Download class="size-4 text-muted-foreground" />
            Data export
          </h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Downloads are generated on demand; stories are capped at the newest 5,000.
          </p>
          <div class="mt-4 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="w-16 text-xs font-medium text-muted-foreground">Accounts</span>
              <Button variant="outline" size="sm" as-child>
                <a href="/api/admin/export?type=users&format=csv" download>
                  <FileText />
                  CSV
                </a>
              </Button>
              <Button variant="outline" size="sm" as-child>
                <a href="/api/admin/export?type=users&format=json" download>
                  <Download />
                  JSON
                </a>
              </Button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="w-16 text-xs font-medium text-muted-foreground">Feeds</span>
              <Button variant="outline" size="sm" as-child>
                <a href="/api/admin/export?type=feeds&format=csv" download>
                  <FileText />
                  CSV
                </a>
              </Button>
              <Button variant="outline" size="sm" as-child>
                <a href="/api/admin/export?type=feeds&format=json" download>
                  <Download />
                  JSON
                </a>
              </Button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="w-16 text-xs font-medium text-muted-foreground">Stories</span>
              <Button variant="outline" size="sm" as-child>
                <a href="/api/admin/export?type=items&format=csv" download>
                  <FileText />
                  CSV
                </a>
              </Button>
              <Button variant="outline" size="sm" as-child>
                <a href="/api/admin/export?type=items&format=json" download>
                  <Download />
                  JSON
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section class="rounded-xl border bg-card">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <h2 class="flex items-center gap-1.5 text-sm font-semibold">
              <Gauge class="size-4 text-muted-foreground" />
              Operator activity log
            </h2>
            <Badge variant="secondary" class="tabular-nums">{{ audit.length }}</Badge>
          </div>
          <ScrollArea class="h-[22rem]">
            <ul class="divide-y">
              <li
                v-for="entry in audit"
                :key="entry.id"
                class="px-4 py-2.5 text-sm"
              >
                <div class="flex flex-wrap items-center gap-x-2">
                  <span class="font-medium">{{ actionLabel(entry.action) }}</span>
                  <span v-if="entry.target" class="text-xs text-muted-foreground">
                    {{ entry.target }}
                  </span>
                  <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                    {{ formatDateTime(entry.createdAt) }}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground">by {{ entry.actor }}</p>
              </li>
              <li
                v-if="!audit.length"
                class="px-4 py-6 text-center text-sm text-muted-foreground"
              >
                Nothing recorded yet.
              </li>
            </ul>
          </ScrollArea>
        </section>
      </TabsContent>
    </Tabs>

    <MobileNav active="admin" @search="navigateTo('/reader')" />

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
  </div>
</template>
