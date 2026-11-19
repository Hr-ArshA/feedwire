<script setup>
import { DialogTrigger } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  asChild: { type: Boolean, default: false },
  class: { type: null, default: '' },
});
</script>

<template>
  <DialogTrigger :as-child="props.asChild" :class="cn(props.class)">
    <slot />
  </DialogTrigger>
</template>
