<script setup>
import { Inbox } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ItemCard from './ItemCard.vue';

const { t } = useI18n();

const props = defineProps({
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  hasMore: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  categories: { type: Array, default: () => [] },
  selectedId: { type: [Number, String], default: null },
  emptyTitle: { type: String, default: 'Nothing here yet' },
  emptyText: {
    type: String,
    default: 'Refresh your feeds or add a new one to get started.',
  },
});

defineEmits([
  'load-more',
  'open',
  'read-here',
  'toggle-read',
  'toggle-favorite',
  'toggle-read-later',
  'mark-above',
]);
</script>

<template>
  <section>
    <div
      v-if="props.error"
      class="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
    >
      {{ props.error }}
    </div>

    <div
      v-if="props.loading && !props.items.length"
      class="overflow-hidden rounded-xl border bg-card"
    >
      <div
        v-for="n in 6"
        :key="n"
        class="flex items-start gap-3 border-b px-4 py-3.5 last:border-b-0"
      >
        <Skeleton v-if="!props.readonly" class="mt-2 size-[7px] rounded-full" />
        <div class="flex-1 space-y-2">
          <Skeleton class="h-4 w-3/5" />
          <Skeleton class="h-3 w-4/5" />
          <Skeleton class="h-3 w-40" />
        </div>
      </div>
    </div>

    <div
      v-else-if="!props.items.length"
      class="flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-6 py-16 text-center"
    >
      <Inbox class="mb-1.5 size-7 text-muted-foreground" />
      <h3 class="text-base font-semibold">{{ props.emptyTitle }}</h3>
      <p class="text-sm text-muted-foreground">{{ props.emptyText }}</p>
    </div>

    <div v-else class="overflow-hidden rounded-xl border bg-card">
      <ItemCard
        v-for="(item, index) in props.items"
        :key="item.id"
        :item="item"
        :selected="item.id === props.selectedId"
        :readonly="props.readonly"
        :categories="props.categories"
        :markable="index > 0"
        @open="$emit('open', $event)"
        @read-here="$emit('read-here', $event)"
        @toggle-read="$emit('toggle-read', $event)"
        @toggle-favorite="$emit('toggle-favorite', $event)"
        @toggle-read-later="$emit('toggle-read-later', $event)"
        @mark-above="$emit('mark-above', $event)"
      />
    </div>

    <div v-if="props.hasMore" class="flex justify-center pt-4">
      <Button
        variant="outline"
        :disabled="props.loading"
        @click="$emit('load-more')"
      >
        {{ props.loading ? t('action.loading') : t('action.loadMore') }}
      </Button>
    </div>
  </section>
</template>
