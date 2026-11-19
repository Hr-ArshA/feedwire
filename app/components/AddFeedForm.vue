<script setup>
import { ref } from 'vue';
import { Rss } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const { state, addFeed } = useReader();

const url = ref('');
const input = ref(null);

async function submit() {
  const value = url.value.trim();
  if (!value) {
    input.value?.$el?.focus();
    return;
  }
  if (await addFeed(value)) url.value = '';
}
</script>

<template>
  <form class="relative flex min-w-0 flex-1 items-center gap-2" @submit.prevent="submit">
    <Rss
      class="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
      aria-hidden="true"
    />
    <Input
      ref="input"
      v-model="url"
      type="url"
      inputmode="url"
      spellcheck="false"
      aria-label="Feed URL"
      placeholder="Paste an RSS or Atom feed URL…"
      class="pl-9"
    />
    <Button type="submit" :disabled="state.adding">
      {{ state.adding ? 'Adding…' : 'Add feed' }}
    </Button>
  </form>
</template>
