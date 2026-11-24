<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Check, Loader2, Plus, Rss, Sparkles } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { POPULAR_FEEDS, sameFeedUrl } from '@/lib/popular-feeds.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const props = defineProps({
  mode: { type: String, default: 'button' },
  class: { type: null, default: '' },
});

const { state, addFeed } = useReader();

const open = ref(false);
const url = ref('');
const input = ref(null);
const addingUrl = ref(null);

const subscribed = computed(() => state.value.feeds.map((feed) => feed.url));

function isSubscribed(feed) {
  return subscribed.value.some((value) => sameFeedUrl(value, feed.url));
}

async function addSuggested(feed) {
  if (addingUrl.value || isSubscribed(feed)) return;
  addingUrl.value = feed.url;
  const added = await addFeed(feed.url);
  addingUrl.value = null;
  if (added) open.value = false;
}

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  input.value?.$el?.focus();
});

async function submit() {
  const value = url.value.trim();
  if (!value) {
    input.value?.$el?.focus();
    return;
  }
  if (await addFeed(value)) {
    url.value = '';
    open.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button
        v-if="props.mode === 'fab'"
        size="icon"
        :class="
          cn(
            'fixed right-4 bottom-20 z-40 size-14 rounded-full shadow-lg shadow-primary/25 sm:hidden',
            props.class
          )
        "
        aria-label="Add feed"
      >
        <Plus class="size-6" />
      </Button>
      <Button v-else variant="outline" :class="cn(props.class)">
        <Plus />
        Add feed
      </Button>
    </DialogTrigger>

    <DialogContent class="max-h-[85dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add a feed</DialogTitle>
        <DialogDescription>
          Paste a feed URL or just the website — we look for its RSS/Atom feed.
          Feeds are shared across everyone, so a feed that is already indexed is
          reused without re-vectorising its stories.
        </DialogDescription>
      </DialogHeader>

      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <div class="relative flex items-center">
          <Rss
            class="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref="input"
            v-model="url"
            type="text"
            inputmode="url"
            spellcheck="false"
            aria-label="Feed or site URL"
            placeholder="example.com or https://example.com/feed.xml"
            class="pl-9"
          />
        </div>

        <DialogFooter>
          <Button type="submit" :disabled="state.adding" class="w-full sm:w-auto">
            {{ state.adding ? 'Adding…' : 'Add feed' }}
          </Button>
        </DialogFooter>
      </form>

      <div class="border-t pt-4">
        <p
          class="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
        >
          <Sparkles class="size-3 text-primary" />
          Popular feeds
        </p>

        <ul class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <li v-for="feed in POPULAR_FEEDS" :key="feed.url">
            <button
              type="button"
              :disabled="isSubscribed(feed) || addingUrl === feed.url"
              :class="
                cn(
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  isSubscribed(feed)
                    ? 'border-border bg-muted/50 text-muted-foreground'
                    : 'border-border bg-card hover:border-ring/60 hover:bg-accent'
                )
              "
              @click="addSuggested(feed)"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ feed.title }}</span>
                <span class="block truncate text-[11px] text-muted-foreground">
                  {{ feed.tag }}
                </span>
              </span>
              <Loader2
                v-if="addingUrl === feed.url"
                class="size-4 shrink-0 animate-spin text-primary"
              />
              <Check
                v-else-if="isSubscribed(feed)"
                class="size-4 shrink-0 text-primary"
              />
              <Plus v-else class="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        </ul>
      </div>
    </DialogContent>
  </Dialog>
</template>
