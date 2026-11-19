<script setup>
import { DialogClose } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  asChild: { type: Boolean, default: false },
  class: { type: null, default: '' },
});
</script>

<template>
  <DialogClose :as-child="props.asChild" :class="cn(props.class)">
    <slot />
  </DialogClose>
</template>
