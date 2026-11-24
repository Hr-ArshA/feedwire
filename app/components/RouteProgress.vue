<script setup>
/**
 * Navigation feedback for the gap between a click and the next page mounting.
 * `useLoadingIndicator` is Nuxt's own router hook, so this stays a core
 * primitive instead of another library.
 */
const { isLoading } = useLoadingIndicator();
</script>

<template>
  <div
    v-if="isLoading"
    role="progressbar"
    aria-label="Loading page"
    class="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary print:hidden"
  />
</template>
