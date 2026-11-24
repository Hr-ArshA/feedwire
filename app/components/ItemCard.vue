<script>
// Module scope: one prefetch per story per page load, shared by every card.
const prefetched = new Set();
</script>

<script setup>
import { computed } from 'vue';
import {
  ArrowUpToLine,
  Bookmark,
  BookOpen,
  CircleCheck,
  CircleDot,
  Eye,
  Star,
} from '@lucide/vue';
import { hostOf, timeAgo } from '@/utils/format.js';
import { categoryBadge } from '@/lib/categories.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const props = defineProps({
  item: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  categories: { type: Array, default: () => [] },
  markable: { type: Boolean, default: false },
});

const emit = defineEmits([
  'open',
  'read-here',
  'toggle-read',
  'toggle-favorite',
  'toggle-read-later',
  'mark-above',
]);

const { t } = useI18n();

const meta = computed(() => ({
  host: hostOf(props.item.resolved_link || props.item.link),
  time: timeAgo(props.item.published_at || props.item.fetched_at),
}));

const categoryName = computed(
  () =>
    props.categories.find((entry) => entry.id === props.item.category)?.label ??
    props.item.category
);

let hoverTimer = null;

function prefetch() {
  if (props.readonly) return;
  const id = props.item.id;
  if (prefetched.has(id)) return;
  prefetched.add(id);
  $fetch(`/api/items/${id}/content`).catch(() => {});
}

function hoverPrefetch() {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(prefetch, 350);
}

function cancelPrefetch() {
  clearTimeout(hoverTimer);
}
</script>

<template>
  <article
    :data-item-id="item.id"
    @pointerenter="hoverPrefetch"
    @pointerleave="cancelPrefetch"
    @pointerdown="prefetch"
    :class="
      cn(
        'group relative flex items-start gap-3 border-b px-4 py-3.5 transition-colors last:border-b-0',
        selected ? 'bg-primary/10' : 'hover:bg-accent/60'
      )
    "
  >
    <span
      v-if="!readonly"
      :class="
        cn(
          'mt-2 size-[7px] shrink-0 rounded-full',
          item.is_read ? 'shadow-[inset_0_0_0_1.5px_var(--border)]' : 'bg-primary'
        )
      "
      aria-hidden="true"
    />

    <div class="min-w-0 flex-1">
      <h3 class="m-0 text-[15px] leading-snug font-semibold tracking-tight">
        <a
          :href="item.resolved_link || item.link || '#'"
          target="_blank"
          rel="noopener noreferrer"
          :class="
            cn(
              'outline-none transition-colors hover:text-primary focus-visible:text-primary',
              !readonly && item.is_read && 'font-normal text-muted-foreground'
            )
          "
          @click.prevent="emit('open', item)"
          >{{ item.title }}</a
        >
      </h3>

      <p
        v-if="item.summary"
        class="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground"
      >
        {{ item.summary }}
      </p>

      <div
        class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground [&>*+*]:before:mr-2 [&>*+*]:before:text-muted-foreground/50 [&>*+*]:before:content-['·']"
      >
        <Badge
          v-if="item.category && item.category !== 'other'"
          variant="outline"
          :class="cn('border px-2', categoryBadge(item.category))"
        >
          {{ categoryName }}
        </Badge>
        <span class="max-w-[16rem] truncate">{{ item.feed_title }}</span>
        <span v-if="item.author" class="max-w-[12rem] truncate">{{ item.author }}</span>
        <span v-if="meta.host" class="hidden sm:inline">{{ meta.host }}</span>
        <span>{{ meta.time }}</span>
        <span
          v-if="item.reader_count"
          class="inline-flex items-center gap-1"
          :title="`${item.reader_count} people read this here`"
        >
          <Eye class="size-3" />
          <span class="tabular-nums">{{ item.reader_count }}</span>
        </span>
        <span
          v-if="item.like_count"
          class="inline-flex items-center gap-1"
          :title="`${item.like_count} people liked this`"
        >
          <Star class="size-3 text-[var(--star)]" />
          <span class="tabular-nums">{{ item.like_count }}</span>
        </span>
        <a
          v-if="item.comments_url"
          :href="item.comments_url"
          target="_blank"
          rel="noopener noreferrer"
          class="underline decoration-border underline-offset-2 outline-none transition-colors hover:text-primary"
          >Discussion</a
        >
      </div>
    </div>

    <div
      class="flex shrink-0 items-center gap-0.5 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
      :class="(item.is_favorite || selected) && 'lg:opacity-100'"
    >
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="t('item.readHere')"
            @click="emit('read-here', item)"
          >
            <BookOpen />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t('item.readHere') }}</TooltipContent>
      </Tooltip>

      <Tooltip v-if="!readonly">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="item.is_read_later ? t('item.removeReadLater') : t('item.readLater')"
            :aria-pressed="!!item.is_read_later"
            :class="item.is_read_later && 'text-primary hover:opacity-80'"
            @click="emit('toggle-read-later', item)"
          >
            <Bookmark :class="item.is_read_later && 'fill-current'" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {{ item.is_read_later ? t('item.removeReadLater') : t('item.readLater') }}
        </TooltipContent>
      </Tooltip>

      <Tooltip v-if="!readonly">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="item.is_favorite ? t('item.removeFavorite') : t('item.addFavorite')"
            :aria-pressed="!!item.is_favorite"
            :class="item.is_favorite && 'text-[var(--star)] hover:opacity-80'"
            @click="emit('toggle-favorite', item)"
          >
            <Star :class="item.is_favorite && 'fill-current'" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {{ item.is_favorite ? t('item.removeFavorite') : t('item.addFavorite') }}
        </TooltipContent>
      </Tooltip>

      <Tooltip v-if="!readonly">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="item.is_read ? t('item.markUnread') : t('item.markRead')"
            @click="emit('toggle-read', item)"
          >
            <CircleCheck v-if="item.is_read" />
            <CircleDot v-else />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {{ item.is_read ? t('item.markUnread') : t('item.markRead') }}
        </TooltipContent>
      </Tooltip>

      <Tooltip v-if="!readonly && markable">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="t('item.markAbove')"
            @click="emit('mark-above', item)"
          >
            <ArrowUpToLine />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t('item.markAbove') }}</TooltipContent>
      </Tooltip>
    </div>
  </article>
</template>
