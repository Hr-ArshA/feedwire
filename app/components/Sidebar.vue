<script setup>
import { ref } from 'vue';
import {
  ChevronDown,
  Download,
  Layers,
  RefreshCw,
  Star,
  Trash2,
  Upload,
} from '@lucide/vue';
import { hostOf } from '@/utils/format.js';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const { state, setView, refreshFeed, removeFeed, importOpml, exportOpml } =
  useReader();

const fileInput = ref(null);
const feedsOpen = ref(false);
const importing = ref(false);

const views = [
  { id: 'all', label: 'All items', icon: Layers, count: () => state.value.stats.total },
  { id: 'unread', label: 'Unread', icon: RefreshCw, count: () => state.value.stats.unread },
  { id: 'favorite', label: 'Favorites', icon: Star, count: () => state.value.stats.favorites },
];

function confirmRemove(feed) {
  if (window.confirm(`Unsubscribe from "${feed.title}"?`)) {
    removeFeed(feed);
  }
}

async function onFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importing.value = true;
  await importOpml(file);
  importing.value = false;
  event.target.value = '';
}
</script>

<template>
  <aside class="flex flex-col gap-5 lg:sticky lg:top-[86px]">
    <nav class="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      <button
        v-for="view in views"
        :key="view.id"
        type="button"
        :class="
          cn(
            'flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
            state.view.kind === view.id
              ? 'bg-primary/12 font-semibold text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )
        "
        @click="setView(view.id)"
      >
        <component :is="view.icon" class="size-4" />
        <span>{{ view.label }}</span>
        <span
          :class="
            cn(
              'ml-auto rounded-full px-1.5 py-px text-xs font-semibold tabular-nums',
              state.view.kind === view.id
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground'
            )
          "
        >
          {{ view.count() }}
        </span>
      </button>
    </nav>

    <div>
      <button
        type="button"
        class="mb-2 flex w-full items-center gap-2 px-2.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase outline-none lg:pointer-events-none"
        :aria-expanded="feedsOpen"
        @click="feedsOpen = !feedsOpen"
      >
        Feeds <span class="font-semibold">{{ state.feeds.length }}</span>
        <ChevronDown
          :class="
            cn(
              'ml-auto size-3.5 transition-transform lg:hidden',
              feedsOpen && 'rotate-180'
            )
          "
        />
      </button>

      <div :class="feedsOpen ? 'block' : 'hidden lg:block'">
      <ScrollArea class="max-h-[46vh] lg:max-h-[60vh]">
        <ul class="flex flex-row gap-1.5 pr-2 pb-1 lg:flex-col lg:gap-0.5">
          <li
            v-for="feed in state.feeds"
            :key="feed.id"
            :class="
              cn(
                'group flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 transition-colors lg:border-transparent lg:py-1',
                state.view.kind === 'feed' && state.view.feedId === feed.id
                  ? 'border-primary/40 bg-primary/10 lg:border-transparent'
                  : 'border-border hover:bg-accent lg:border-transparent'
              )
            "
            :title="feed.last_error || feed.url"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 flex-col items-start text-left outline-none"
              @click="setView('feed', feed.id)"
            >
              <span
                :class="
                  cn(
                    'w-full truncate text-sm font-medium',
                    state.view.kind === 'feed' && state.view.feedId === feed.id
                      ? 'text-primary'
                      : 'text-foreground'
                  )
                "
              >
                {{ feed.title || hostOf(feed.url) }}
              </span>
              <span class="hidden w-full truncate text-xs text-muted-foreground lg:block">
                {{ hostOf(feed.url) }}
              </span>
            </button>

            <Badge
              v-if="feed.unread_count"
              variant="secondary"
              class="px-1.5 text-[11px] tabular-nums"
            >
              {{ feed.unread_count }}
            </Badge>
            <span
              v-if="feed.last_error"
              class="grid size-4 place-items-center rounded-full bg-destructive/15 text-[11px] font-bold text-destructive"
              title="Last refresh failed"
            >
              !
            </span>

            <div
              class="flex items-center gap-px opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
            >
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Refresh feed"
                    @click.stop="refreshFeed(feed)"
                  >
                    <RefreshCw />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh feed</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Unsubscribe"
                    class="hover:text-destructive"
                    @click.stop="confirmRemove(feed)"
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Unsubscribe</TooltipContent>
              </Tooltip>
            </div>
          </li>
        </ul>
      </ScrollArea>

      <p v-if="!state.feeds.length" class="px-2.5 text-xs text-muted-foreground">
        No feeds yet — add one above.
      </p>
      </div>

      <div class="mt-3 flex items-center gap-1.5">
        <input
          ref="fileInput"
          type="file"
          accept=".opml,.xml,text/xml,application/xml"
          class="hidden"
          @change="onFile"
        />
        <Button
          variant="outline"
          size="sm"
          class="flex-1"
          :disabled="importing"
          @click="fileInput?.click()"
        >
          <Upload />
          {{ importing ? 'Importing…' : 'Import OPML' }}
        </Button>
        <Button variant="outline" size="sm" class="flex-1" @click="exportOpml">
          <Download />
          Export
        </Button>
      </div>
    </div>
  </aside>
</template>
