<script setup>
import { TabsRoot } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  defaultValue: { type: String, default: undefined },
  class: { type: null, default: '' },
});

const model = defineModel({ type: String, default: undefined });
</script>

<template>
  <TabsRoot
    v-model="model"
    :default-value="props.defaultValue"
    :class="cn(props.class)"
  >
    <slot />
  </TabsRoot>
</template>
