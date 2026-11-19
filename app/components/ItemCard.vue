<script setup>
import { computed } from 'vue';
import { BookOpen, CircleCheck, CircleDot, Star } from '@lucide/vue';
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
});

const emit = defineEmits(['open', 'read-here', 'toggle-read', 'toggle-favorite']);

const meta = computed(() => ({
  host: hostOf(props.item.link),
  time: timeAgo(props.item.published_at || props.item.fetched_at),
}));

const categoryName = computed(
  () =>
    props.categories.find((entry) => entry.id === props.item.category)?.label ??
    props.item.category
);
</script>

<template>
  <article
    :data-item-id="item.id"
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
          :href="item.link || '#'"
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
            aria-label="Read here"
            @click="emit('read-here', item)"
          >
            <BookOpen />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Read here</TooltipContent>
      </Tooltip>

      <Tooltip v-if="!readonly">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="item.is_favorite ? 'Remove from favorites' : 'Add to favorites'"
            :aria-pressed="!!item.is_favorite"
            :class="item.is_favorite && 'text-[var(--star)] hover:opacity-80'"
            @click="emit('toggle-favorite', item)"
          >
            <Star :class="item.is_favorite && 'fill-current'" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {{ item.is_favorite ? 'Remove from favorites' : 'Add to favorites' }}
        </TooltipContent>
      </Tooltip>

      <Tooltip v-if="!readonly">
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="item.is_read ? 'Mark as unread' : 'Mark as read'"
            @click="emit('toggle-read', item)"
          >
            <CircleCheck v-if="item.is_read" />
            <CircleDot v-else />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {{ item.is_read ? 'Mark as unread' : 'Mark as read' }}
        </TooltipContent>
      </Tooltip>
    </div>
  </article>
</template>
