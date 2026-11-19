<script setup>
import { onMounted, ref } from 'vue';
import {
  Download,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  ACCENTS,
  FONTS,
  TEXT_SIZES,
  THEMES,
  accentSwatch,
} from '@/lib/appearance.js';
import { hostOf } from '@/utils/format.js';
import { cn } from '@/lib/utils';

useHead({ title: 'Settings · Feedwire' });

const { user } = useAuth();
const { prefs, update, reset } = useAppearance();
const { state, loadFeeds, refreshFeed, removeFeed, importOpml, exportOpml } =
  useReader();

const fileInput = ref(null);
const importing = ref(false);

onMounted(() => {
  if (user.value) loadFeeds().catch(() => {});
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
</script>

<template>
  <div class="mx-auto max-w-[760px] px-4 py-6 sm:px-6 sm:py-8">
    <header class="mb-5">
      <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Reading appearance and feed management.
      </p>
    </header>

    <Tabs default-value="appearance">
      <TabsList class="mb-5">
        <TabsTrigger value="appearance">Appearance</TabsTrigger>
        <TabsTrigger value="feeds">Feeds</TabsTrigger>
      </TabsList>

      <TabsContent value="appearance" class="space-y-4">
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

          <ul class="divide-y">
            <li
              v-for="feed in state.feeds"
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
            v-if="!state.feeds.length"
            class="px-4 py-6 text-center text-sm text-muted-foreground"
          >
            No feeds yet — add one from the reader.
          </p>
        </section>
      </TabsContent>
    </Tabs>
  </div>
</template>
