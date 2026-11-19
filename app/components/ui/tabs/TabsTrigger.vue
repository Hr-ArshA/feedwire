<script setup>
import { TabsTrigger } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  value: { type: String, required: true },
  class: { type: null, default: '' },
});
</script>

<template>
  <TabsTrigger
    :value="props.value"
    :class="
      cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs [&_svg]:size-4',
        props.class
      )
    "
  >
    <slot />
  </TabsTrigger>
</template>
