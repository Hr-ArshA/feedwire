<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  Bell,
  BellOff,
  Clock,
  Download,
  Laptop,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Trash2,
  Upload,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ACCENTS,
  FONTS,
  TEXT_SIZES,
  THEMES,
  accentSwatch,
} from '@/lib/appearance.js';
import { deviceLabel, hostOf, intervalLabel, timeAgo } from '@/utils/format.js';
import { cn } from '@/lib/utils';

useHead({ title: 'Settings · Feedwire' });

useSeoMeta({ robots: 'noindex,nofollow' });

const { user } = useAuth();
const { locale, setLocale, locales, t } = useI18n();
const { prefs, update, reset } = useAppearance();
const {
  state,
  loadFeeds,
  refreshFeed,
  setFeedInterval,
  setFeedNotify,
  removeFeed,
  importOpml,
  exportOpml,
} = useReader();

const INTERVALS = [
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 180, label: 'Every 3 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Once a day' },
  { value: 0, label: 'Paused' },
];

const fileInput = ref(null);
const importing = ref(false);
const feedQuery = ref('');

const sessions = ref([]);
const sessionsLoading = ref(false);
const sessionsError = ref(null);
const sessionBusy = ref(null);

const exportBusy = ref(false);
const exportError = ref(null);

const deletePassword = ref('');
const deleteConfirm = ref('');
const deleteBusy = ref(false);
const deleteError = ref(null);
const notice = ref(null);

const pushSupported = ref(false);
const pushSubscribed = ref(false);
const pushBusy = ref(false);

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

async function refreshPushState() {
  if (!import.meta.client) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  pushSupported.value = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    pushSubscribed.value = Boolean(subscription);
  } catch {
    pushSubscribed.value = false;
  }
}

async function enablePush() {
  if (pushBusy.value) return;
  pushBusy.value = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      notify('Notification permission was not granted');
      return;
    }
    const { publicKey } = await $fetch('/api/push/public-key');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await $fetch('/api/push/subscribe', {
      method: 'POST',
      body: { subscription: subscription.toJSON() },
    });
    pushSubscribed.value = true;
    notify('Push notifications enabled');
  } catch (error) {
    notify(errorMessage(error));
  } finally {
    pushBusy.value = false;
  }
}

async function disablePush() {
  if (pushBusy.value) return;
  pushBusy.value = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await $fetch('/api/push/unsubscribe', {
        method: 'POST',
        body: { endpoint: subscription.endpoint },
      });
      await subscription.unsubscribe();
    }
    pushSubscribed.value = false;
    notify('Push notifications disabled');
  } catch (error) {
    notify(errorMessage(error));
  } finally {
    pushBusy.value = false;
  }
}

async function testPush() {
  try {
    const data = await $fetch('/api/push/test', { method: 'POST' });
    notify(data.sent ? 'Test notification sent' : 'No device is subscribed');
  } catch (error) {
    notify(errorMessage(error));
  }
}

let noticeTimer = null;

function notify(message) {
  notice.value = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
  }, 4200);
}

function errorMessage(error) {
  return error?.data?.error ?? error?.message ?? 'Something went wrong';
}

async function loadSessions() {
  if (!user.value) return;
  sessionsLoading.value = true;
  sessionsError.value = null;
  try {
    const data = await $fetch('/api/auth/sessions');
    sessions.value = data.sessions ?? [];
  } catch (error) {
    sessionsError.value = errorMessage(error);
  } finally {
    sessionsLoading.value = false;
  }
}

async function revokeSession(entry) {
  sessionBusy.value = entry.id;
  try {
    await $fetch(`/api/auth/sessions/${entry.id}`, { method: 'DELETE' });
    notify('That device has been signed out');
    await loadSessions();
  } catch (error) {
    sessionsError.value = errorMessage(error);
  } finally {
    sessionBusy.value = null;
  }
}

async function revokeOthers(includeCurrent = false) {
  const question = includeCurrent
    ? 'Sign out of every device, including this one?'
    : 'Sign out of every other device?';
  if (!window.confirm(question)) return;
  sessionBusy.value = includeCurrent ? 'all' : 'others';
  try {
    const data = await $fetch('/api/auth/sessions', {
      method: 'DELETE',
      query: includeCurrent ? { all: 1 } : {},
    });
    if (includeCurrent) {
      user.value = null;
      await navigateTo('/login');
      return;
    }
    notify(
      data.revoked
        ? `Signed out ${data.revoked} other device(s)`
        : 'No other devices were signed in'
    );
    await loadSessions();
  } catch (error) {
    sessionsError.value = errorMessage(error);
  } finally {
    sessionBusy.value = null;
  }
}

async function exportAccount() {
  if (exportBusy.value) return;
  exportBusy.value = true;
  exportError.value = null;
  try {
    const response = await $fetch.raw('/api/account/export', {
      responseType: 'blob',
    });
    const disposition = response.headers.get('content-disposition') ?? '';
    const filename =
      /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'feedwire-account.json';
    const url = URL.createObjectURL(response._data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    exportError.value = errorMessage(error);
  } finally {
    exportBusy.value = false;
  }
}

async function deleteAccount() {
  if (deleteBusy.value) return;
  if (deleteConfirm.value.trim().toUpperCase() !== 'DELETE') {
    deleteError.value = 'Type DELETE in the box to confirm.';
    return;
  }
  if (
    !window.confirm(
      'Delete your account? Your subscriptions, read state and favourites are removed permanently.'
    )
  ) {
    return;
  }
  deleteBusy.value = true;
  deleteError.value = null;
  try {
    await $fetch('/api/account', {
      method: 'DELETE',
      body: { password: deletePassword.value, confirm: deleteConfirm.value },
    });
    user.value = null;
    await navigateTo('/');
  } catch (error) {
    deleteError.value = errorMessage(error);
  } finally {
    deleteBusy.value = false;
  }
}

const filteredFeeds = computed(() => {
  const q = feedQuery.value.trim().toLowerCase();
  if (!q) return state.value.feeds;
  return state.value.feeds.filter((feed) =>
    `${feed.title ?? ''} ${hostOf(feed.url)}`.toLowerCase().includes(q)
  );
});

onMounted(() => {
  if (user.value) loadFeeds().catch(() => {});
  loadSessions();
  refreshPushState();
});

async function onFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importing.value = true;
  await importOpml(file);
  importing.value = false;
  event.target.value = '';
}

function confirmRemove(feed) {
  if (window.confirm(`Unsubscribe from "${feed.title}"?`)) {
    removeFeed(feed);
  }
}

function goSearch() {
  navigateTo('/reader');
}
</script>

<template>
  <div class="mx-auto max-w-[760px] px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:pb-8">
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Reading appearance and feed management.
        </p>
      </div>
      <Button
        v-if="user?.role === 'admin'"
        variant="outline"
        size="sm"
        as-child
      >
        <NuxtLink to="/admin">
          <ShieldCheck />
          Admin dashboard
        </NuxtLink>
      </Button>
    </header>

    <p
      v-if="notice"
      class="mb-4 rounded-lg border bg-muted/60 px-3.5 py-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      {{ notice }}
    </p>

    <Tabs default-value="appearance">
      <TabsList class="mb-5">
          <TabsTrigger value="appearance">{{ t('settings.appearance') }}</TabsTrigger>
          <TabsTrigger value="feeds">{{ t('settings.feeds') }}</TabsTrigger>
          <TabsTrigger value="account">{{ t('settings.account') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="appearance" class="space-y-4">
        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">{{ t('settings.language') }}</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ t('settings.languageHint') }}
          </p>
          <ToggleGroup
            :model-value="locale"
            type="single"
            class="mt-3 w-full"
            :aria-label="t('settings.language')"
            @update:model-value="(value) => value && setLocale(value)"
          >
            <ToggleGroupItem
              v-for="entry in locales"
              :key="entry.id"
              :value="entry.id"
              class="flex-1"
            >
              {{ entry.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </section>

        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">{{ t('settings.notifications') }}</h2>
          <p v-if="!pushSupported" class="mt-0.5 text-xs text-muted-foreground">
            {{ t('settings.pushUnsupported') }}
          </p>
          <div v-if="pushSupported" class="mt-3 flex flex-wrap items-center gap-2">
            <Button
              v-if="!pushSubscribed"
              size="sm"
              :disabled="pushBusy"
              @click="enablePush"
            >
              <Bell />
              {{ t('settings.pushEnable') }}
            </Button>
            <template v-else>
              <Button variant="outline" size="sm" :disabled="pushBusy" @click="disablePush">
                <BellOff />
                {{ t('settings.pushDisable') }}
              </Button>
              <Button variant="ghost" size="sm" @click="testPush">
                {{ t('settings.pushTest') }}
              </Button>
            </template>
          </div>
        </section>

        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">Theme</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Light, dark, or follow the system.
          </p>
          <ToggleGroup
            :model-value="prefs.theme"
            type="single"
            class="mt-3 w-full"
            aria-label="Theme"
            @update:model-value="(value) => value && update({ theme: value })"
          >
            <ToggleGroupItem
              v-for="theme in THEMES"
              :key="theme.id"
              :value="theme.id"
              class="flex-1"
            >
              {{ theme.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </section>

        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">Accent colour</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Used for links, buttons and highlights.
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              v-for="accent in ACCENTS"
              :key="accent.id"
              type="button"
              :aria-label="accent.label"
              :aria-pressed="prefs.accent === accent.id"
              :class="
                cn(
                  'size-8 rounded-full outline-none ring-offset-2 ring-offset-background transition focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  accentSwatch(accent.id),
                  prefs.accent === accent.id
                    ? 'ring-2 ring-ring'
                    : 'opacity-80 hover:opacity-100'
                )
              "
              @click="update({ accent: accent.id })"
            />
          </div>
        </section>

        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">Font</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Applies to the whole interface, including articles.
          </p>
          <ToggleGroup
            :model-value="prefs.font"
            type="single"
            class="mt-3 w-full"
            aria-label="Font family"
            @update:model-value="(value) => value && update({ font: value })"
          >
            <ToggleGroupItem
              v-for="font in FONTS"
              :key="font.id"
              :value="font.id"
              class="flex-1"
            >
              {{ font.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </section>

        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">Text size</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Scales the interface and article text.
          </p>
          <ToggleGroup
            :model-value="prefs.size"
            type="single"
            class="mt-3 w-full"
            aria-label="Text size"
            @update:model-value="(value) => value && update({ size: value })"
          >
            <ToggleGroupItem
              v-for="size in TEXT_SIZES"
              :key="size.id"
              :value="size.id"
              class="flex-1"
            >
              {{ size.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </section>

        <div class="flex justify-end">
          <Button variant="outline" size="sm" @click="reset">
            <RotateCcw />
            Reset to defaults
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="feeds" class="space-y-4">
        <section class="rounded-xl border bg-card p-4 sm:p-5">
          <h2 class="text-sm font-semibold">Subscriptions</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Import a feed list from another reader, or export yours.
          </p>

          <input
            ref="fileInput"
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            class="hidden"
            @change="onFile"
          />

          <div v-if="user" class="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="importing"
              @click="fileInput?.click()"
            >
              <Upload />
              {{ importing ? 'Importing…' : 'Import OPML' }}
            </Button>
            <Button variant="outline" size="sm" @click="exportOpml">
              <Download />
              Export OPML
            </Button>
          </div>

          <p v-else class="mt-3 text-sm text-muted-foreground">
            <NuxtLink to="/login" class="text-primary underline underline-offset-2">
              Sign in
            </NuxtLink>
            to import or export your feeds.
          </p>
        </section>

        <section v-if="user" class="rounded-xl border bg-card">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <h2 class="text-sm font-semibold">Your feeds</h2>
            <Badge variant="secondary" class="tabular-nums">
              {{ state.feeds.length }}
            </Badge>
          </div>

          <div class="border-b px-4 py-2.5">
            <div class="relative flex items-center">
              <Search
                class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                v-model="feedQuery"
                type="search"
                placeholder="Search feeds"
                aria-label="Search subscribed feeds"
                class="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          <ul class="divide-y">
            <li
              v-for="feed in filteredFeeds"
              :key="feed.id"
              class="flex items-center gap-2 px-4 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">
                  {{ feed.title || hostOf(feed.url) }}
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ hostOf(feed.url) }}
                  <span v-if="feed.last_error" class="text-destructive">
                    · {{ feed.last_error }}
                  </span>
                </p>
              </div>
              <Badge
                v-if="feed.unread_count"
                variant="secondary"
                class="px-1.5 text-[11px] tabular-nums"
              >
                {{ feed.unread_count }}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                    :aria-label="`Refresh interval for ${feed.title || hostOf(feed.url)}`"
                  >
                    <Clock class="size-3.5" />
                    {{ intervalLabel(feed.fetch_interval_minutes) }}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    v-for="option in INTERVALS"
                    :key="option.value"
                    @select="setFeedInterval(feed, option.value)"
                  >
                    {{ option.label }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon-sm"
                :aria-pressed="!!feed.notify"
                :aria-label="
                  feed.notify ? 'Disable push notifications' : 'Enable push notifications'
                "
                :class="feed.notify && 'text-primary'"
                @click="setFeedNotify(feed, !feed.notify)"
              >
                <Bell v-if="feed.notify" />
                <BellOff v-else />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh feed"
                @click="refreshFeed(feed)"
              >
                <RefreshCw />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="hover:text-destructive"
                aria-label="Unsubscribe"
                @click="confirmRemove(feed)"
              >
                <Trash2 />
              </Button>
            </li>
          </ul>

          <p
            v-if="state.feeds.length && !filteredFeeds.length"
            class="px-4 py-6 text-center text-sm text-muted-foreground"
          >
            No feeds match your search.
          </p>

          <p
            v-if="!state.feeds.length"
            class="px-4 py-6 text-center text-sm text-muted-foreground"
          >
            No feeds yet — add one from the reader.
          </p>
        </section>
      </TabsContent>

      <TabsContent value="account" class="space-y-4">
        <p v-if="!user" class="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          <NuxtLink to="/login" class="text-primary underline underline-offset-2">
            Sign in
          </NuxtLink>
          to manage your account.
        </p>

        <template v-else>
          <section class="rounded-xl border bg-card p-4 sm:p-5">
            <h2 class="text-sm font-semibold">Profile</h2>
            <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-xs text-muted-foreground">Name</dt>
                <dd class="font-medium">{{ user.displayName || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Email</dt>
                <dd class="truncate font-medium">{{ user.email }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Role</dt>
                <dd class="font-medium capitalize">{{ user.role }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">Subscriptions</dt>
                <dd class="font-medium tabular-nums">{{ state.feeds.length }}</dd>
              </div>
            </dl>
          </section>

          <section class="rounded-xl border bg-card">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 class="flex items-center gap-1.5 text-sm font-semibold">
                  <Laptop class="size-4 text-muted-foreground" />
                  Signed-in devices
                </h2>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  Sessions are valid for 30 days. Sign out anything you no longer use.
                </p>
              </div>
              <Badge variant="secondary" class="tabular-nums">{{ sessions.length }}</Badge>
            </div>

            <ul class="divide-y">
              <li
                v-for="entry in sessions"
                :key="entry.id"
                class="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div class="min-w-0 flex-1 basis-48">
                  <p class="flex items-center gap-2 truncate text-sm font-medium">
                    {{ deviceLabel(entry.userAgent) }}
                    <Badge v-if="entry.current" variant="secondary" class="text-[11px]">
                      this device
                    </Badge>
                  </p>
                  <p class="truncate text-xs text-muted-foreground">
                    Active {{ timeAgo(entry.lastSeenAt || entry.createdAt) }} · signed in
                    {{ timeAgo(entry.createdAt) }}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="sessionBusy === entry.id"
                  :aria-label="`Sign out ${deviceLabel(entry.userAgent)}`"
                  @click="revokeSession(entry)"
                >
                  <Loader2 v-if="sessionBusy === entry.id" class="animate-spin" />
                  <LogOut v-else />
                </Button>
              </li>
              <li
                v-if="sessionsLoading"
                class="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
              >
                <Loader2 class="size-4 animate-spin" />
                Loading devices…
              </li>
              <li
                v-if="!sessionsLoading && !sessions.length"
                class="px-4 py-6 text-center text-sm text-muted-foreground"
              >
                No active sessions.
              </li>
            </ul>

            <p v-if="sessionsError" class="px-4 pb-3 text-xs text-destructive">
              {{ sessionsError }}
            </p>

            <div class="flex flex-wrap gap-2 border-t px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                :disabled="!!sessionBusy"
                @click="revokeOthers(false)"
              >
                <LogOut />
                Sign out other devices
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="!!sessionBusy"
                @click="revokeOthers(true)"
              >
                <LogOut />
                Sign out everywhere
              </Button>
            </div>
          </section>

          <section class="rounded-xl border bg-card p-4 sm:p-5">
            <h2 class="text-sm font-semibold">Your data</h2>
            <p class="mt-0.5 text-xs text-muted-foreground">
              A JSON file with your profile, subscriptions and reading state. No operator
              needed.
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" :disabled="exportBusy" @click="exportAccount">
                <Loader2 v-if="exportBusy" class="animate-spin" />
                <Download v-else />
                Export my data
              </Button>
              <span v-if="exportError" class="text-xs text-destructive">{{ exportError }}</span>
            </div>
          </section>

          <section class="rounded-xl border border-destructive/40 bg-card p-4 sm:p-5">
            <h2 class="flex items-center gap-1.5 text-sm font-semibold text-destructive">
              <TriangleAlert class="size-4" />
              Delete account
            </h2>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Removes your account, subscriptions and reading state permanently. Export your
              data first if you want a copy.
            </p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                v-model="deletePassword"
                type="password"
                placeholder="Your password"
                aria-label="Password to confirm deletion"
                autocomplete="current-password"
                class="h-9 text-sm"
              />
              <Input
                v-model="deleteConfirm"
                type="text"
                placeholder="Type DELETE"
                aria-label="Type DELETE to confirm"
                class="h-9 text-sm"
              />
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                :disabled="deleteBusy || !deletePassword || !deleteConfirm"
                @click="deleteAccount"
              >
                <Loader2 v-if="deleteBusy" class="animate-spin" />
                <Trash2 v-else />
                Delete my account
              </Button>
              <span v-if="deleteError" class="text-xs text-destructive">{{ deleteError }}</span>
            </div>
          </section>
        </template>
      </TabsContent>
    </Tabs>

    <MobileNav active="settings" @search="goSearch" />
  </div>
</template>
