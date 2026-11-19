<script setup>
import { SlidersHorizontal } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: null, default: '' },
});

const { state, setView, setOpenMode } = useReader();

const views = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'favorite', label: 'Favorites' },
];
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button variant="outline" :class="cn('justify-start', props.class)">
        <SlidersHorizontal />
        Filters
        <span
          v-if="state.view.kind !== 'all' || state.openMode === 'external'"
          class="ml-auto size-1.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      </Button>
    </DialogTrigger>

    <DialogContent>
      <DialogHeader>
        <DialogTitle>Filters</DialogTitle>
        <DialogDescription>
          Choose which stories to show and where they open.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5">
        <div class="space-y-2">
          <p
            class="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
          >
            Show
          </p>
          <ToggleGroup
            :model-value="state.view.kind"
            type="single"
            class="w-full"
            aria-label="Which stories to show"
            @update:model-value="(value) => value && setView(value)"
          >
            <ToggleGroupItem
              v-for="view in views"
              :key="view.id"
              :value="view.id"
              class="flex-1"
            >
              {{ view.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div class="space-y-2">
          <p
            class="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
          >
            Open stories in
          </p>
          <ToggleGroup
            :model-value="state.openMode"
            type="single"
            class="w-full"
            aria-label="Where to open stories"
            @update:model-value="(value) => value && setOpenMode(value)"
          >
            <ToggleGroupItem value="internal" class="flex-1">
              Read here
            </ToggleGroupItem>
            <ToggleGroupItem value="external" class="flex-1">
              Original site
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <DialogFooter>
        <DialogClose as-child>
          <Button variant="outline" class="w-full sm:w-auto">Done</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
