<script setup>
import { TabsContent } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps({
  value: { type: String, required: true },
  class: { type: null, default: '' },
});
</script>

<template>
  <TabsContent
    :value="props.value"
    :class="cn('outline-none', props.class)"
  >
    <slot />
  </TabsContent>
</template>
