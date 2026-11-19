<script setup>
import { TooltipTrigger } from 'reka-ui';

const props = defineProps({
  as: { type: [String, Object], default: 'button' },
  asChild: { type: Boolean, default: false },
});
</script>

<template>
  <TooltipTrigger :as="as" :as-child="asChild">
    <slot />
  </TooltipTrigger>
</template>
