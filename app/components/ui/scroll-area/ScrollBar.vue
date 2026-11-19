<script setup>
import { ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  orientation: { type: String, default: 'vertical' },
  class: { type: null, default: '' },
});
</script>

<template>
  <ScrollAreaScrollbar
    :orientation="orientation"
    :class="
      cn(
        'flex touch-none select-none p-px transition-colors',
        orientation === 'vertical'
          ? 'h-full w-2.5 border-l border-l-transparent'
          : 'h-2.5 flex-col border-t border-t-transparent',
        props.class
      )
    "
  >
    <ScrollAreaThumb class="relative flex-1 rounded-full bg-border" />
  </ScrollAreaScrollbar>
</template>
