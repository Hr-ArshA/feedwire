<script setup>
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: null, default: '' },
});

const model = defineModel({ type: String, default: '' });
</script>

<template>
  <input
    v-model="model"
    :class="
      cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40',
        props.class
      )
    "
  />
</template>
