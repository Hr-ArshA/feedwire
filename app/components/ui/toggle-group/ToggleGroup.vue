<script setup>
import { ToggleGroupRoot } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  type: { type: String, default: 'single' },
  class: { type: null, default: '' },
});

const model = defineModel({ type: [String, Array], default: undefined });
</script>

<template>
  <ToggleGroupRoot
    v-model="model"
    :type="type"
    :roving-focus="false"
    :class="
      cn(
        'inline-flex w-fit items-center gap-1 rounded-md border bg-muted/40 p-1',
        props.class
      )
    "
  >
    <slot />
  </ToggleGroupRoot>
</template>
