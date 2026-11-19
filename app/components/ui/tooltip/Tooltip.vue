<script setup>
import { TooltipRoot } from 'reka-ui';

const props = defineProps({
  defaultOpen: { type: Boolean, default: false },
  delayDuration: { type: Number, default: 200 },
});
</script>

<template>
  <TooltipRoot
    :default-open="defaultOpen"
    :delay-duration="delayDuration"
  >
    <slot />
  </TooltipRoot>
</template>
