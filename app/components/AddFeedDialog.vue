<script setup>
import { nextTick, ref, watch } from 'vue';
import { Plus, Rss } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const props = defineProps({
  mode: { type: String, default: 'button' },
  class: { type: null, default: '' },
});

const { state, addFeed } = useReader();

const open = ref(false);
const url = ref('');
const input = ref(null);

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  input.value?.$el?.focus();
});

async function submit() {
  const value = url.value.trim();
  if (!value) {
    input.value?.$el?.focus();
    return;
  }
  if (await addFeed(value)) {
    url.value = '';
    open.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button
        v-if="props.mode === 'fab'"
        size="icon"
        :class="
          cn(
            'fixed right-4 bottom-20 z-40 size-14 rounded-full shadow-lg shadow-primary/25 sm:hidden',
            props.class
          )
        "
        aria-label="Add feed"
      >
        <Plus class="size-6" />
      </Button>
      <Button v-else variant="outline" :class="cn(props.class)">
        <Plus />
        Add feed
      </Button>
    </DialogTrigger>

    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add a feed</DialogTitle>
        <DialogDescription>
          Paste an RSS or Atom URL. Feeds are shared across everyone, so a feed
          that is already indexed is reused without re-vectorising its stories.
        </DialogDescription>
      </DialogHeader>

      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <div class="relative flex items-center">
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
            placeholder="https://example.com/feed.xml"
            class="pl-9"
          />
        </div>

        <DialogFooter>
          <Button type="submit" :disabled="state.adding" class="w-full sm:w-auto">
            {{ state.adding ? 'Adding…' : 'Add feed' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
