<script setup>
import { TooltipArrow, TooltipContent, TooltipPortal } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  sideOffset: { type: Number, default: 6 },
  class: { type: null, default: '' },
});
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      :side-offset="sideOffset"
      :class="
        cn(
          'z-50 w-fit origin-(--reka-tooltip-content-transform-origin) rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          props.class
        )
      "
    >
      <slot />
      <TooltipArrow class="fill-primary" :width="8" :height="4" />
    </TooltipContent>
  </TooltipPortal>
</template>
