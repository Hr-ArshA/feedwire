<script setup>
import { TooltipProvider } from '@/components/ui/tooltip';
</script>

<template>
  <TooltipProvider>
    <div class="min-h-dvh bg-background text-foreground">
      <RouteProgress />
      <AppHeader />
      <slot />
    </div>
  </TooltipProvider>
</template>
