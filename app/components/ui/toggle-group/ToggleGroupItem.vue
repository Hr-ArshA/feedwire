<script setup>
import { ToggleGroupItem } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  value: { type: [String, Number], required: true },
  class: { type: null, default: '' },
});
</script>

<template>
  <ToggleGroupItem
    :value="value"
    :class="
      cn(
        'inline-flex h-7 items-center justify-center rounded-sm px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
        'data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs',
        props.class
      )
    "
  >
    <slot />
  </ToggleGroupItem>
</template>
