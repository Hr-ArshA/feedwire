<script setup>
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui';
import { cn } from '@/lib/utils';
import ScrollBar from './ScrollBar.vue';

const props = defineProps({
  type: { type: String, default: 'hover' },
  orientation: { type: String, default: 'vertical' },
  class: { type: null, default: '' },
});
</script>

<template>
  <ScrollAreaRoot
    :type="type"
    :class="cn('relative overflow-hidden', props.class)"
  >
    <ScrollAreaViewport class="size-full rounded-[inherit]">
      <slot />
    </ScrollAreaViewport>
    <ScrollBar :orientation="orientation" />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
