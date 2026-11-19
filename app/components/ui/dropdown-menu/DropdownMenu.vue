<script setup>
import { DropdownMenuRoot } from 'reka-ui';

const props = defineProps({
  modal: { type: Boolean, default: true },
});
</script>

<template>
  <DropdownMenuRoot :modal="props.modal">
    <slot />
  </DropdownMenuRoot>
</template>
