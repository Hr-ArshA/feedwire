<script setup>
import { ref } from 'vue';
import { categoryActive, categoryDot } from '@/lib/categories.js';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  active: { type: String, default: null },
});

const emit = defineEmits(['select']);

const strip = ref(null);

/**
 * Real horizontal scroller: visible thin scrollbar, drag support and
 * vertical-wheel-to-horizontal mapping (mouse users have no trackpad).
 */
function onWheel(event) {
  const viewport = strip.value?.querySelector('[data-reka-scroll-area-viewport]');
  if (!viewport) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  const max = viewport.scrollWidth - viewport.clientWidth;
  if (max <= 0) return;

  const next = Math.min(Math.max(viewport.scrollLeft + event.deltaY, 0), max);
  if (next === viewport.scrollLeft) return; // let the page scroll at either end

  viewport.scrollLeft = next;
  event.preventDefault();
}

function baseChip() {
  return 'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40';
}
</script>

<template>
  <div ref="strip" class="mb-4 w-full" @wheel="onWheel">
    <ScrollArea orientation="horizontal" class="w-full">
      <div class="flex w-max items-center gap-2 pb-2">
        <button
          type="button"
          :aria-pressed="!props.active"
          :class="
            cn(
              baseChip(),
              !props.active
                ? 'border-primary bg-primary/12 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-ring/60 hover:text-foreground'
            )
          "
          @click="emit('select', null)"
        >
          All topics
        </button>

        <button
          v-for="category in props.categories"
          v-show="category.count || props.active === category.id"
          :key="category.id"
          type="button"
          :title="category.fa"
          :aria-pressed="props.active === category.id"
          :class="
            cn(
              baseChip(),
              props.active === category.id
                ? categoryActive(category.id)
                : 'border-border bg-card text-muted-foreground hover:border-ring/60 hover:text-foreground'
            )
          "
          @click="emit('select', category.id)"
        >
          <span
            :class="cn('size-1.5 rounded-full', categoryDot(category.id))"
            aria-hidden="true"
          />
          {{ category.label }}
          <span class="tabular-nums opacity-60">{{ category.count }}</span>
        </button>
      </div>
    </ScrollArea>
  </div>
</template>
