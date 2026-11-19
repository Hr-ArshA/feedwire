<script setup>
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: null, default: '' },
});
</script>

<template>
  <div :class="cn('animate-pulse rounded-md bg-accent', props.class)" />
</template>
