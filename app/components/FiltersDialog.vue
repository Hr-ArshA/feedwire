<script setup>
import { computed, ref } from 'vue';
import { Search, SlidersHorizontal } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { categoryActive, categoryDot } from '@/lib/categories.js';
import { cn } from '@/lib/utils';

const props = defineProps({
  class: { type: null, default: '' },
  readerKey: { type: String, default: 'reader' },
});

const { state, publicMode, setView, setOpenMode, setCategory } = useReader(
  props.readerKey
);

const topicQuery = ref('');

const visibleCategories = computed(() => {
  const q = topicQuery.value.trim().toLowerCase();
  return state.value.categories.filter(
    (category) =>
      (category.count || state.value.category === category.id) &&
      (!q || `${category.label} ${category.fa ?? ''}`.toLowerCase().includes(q))
  );
});

const views = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'favorite', label: 'Favorites' },
];

const isFiltered = computed(
  () =>
    state.value.view.kind !== 'all' ||
    state.value.openMode === 'external' ||
    Boolean(state.value.category)
);
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button variant="outline" :class="cn('justify-start', props.class)">
        <SlidersHorizontal />
        Filters
        <span
          v-if="isFiltered"
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
        <div v-if="!publicMode" class="space-y-2">
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
            Topics
          </p>
          <div class="relative flex items-center">
            <Search
              class="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              v-model="topicQuery"
              type="search"
              placeholder="Search topics"
              aria-label="Search topics"
              class="h-8 pl-8 text-sm"
            />
          </div>

          <ScrollArea class="max-h-52">
            <div class="flex flex-wrap gap-1.5 pr-2">
              <button
                type="button"
                :aria-pressed="!state.category"
                :class="
                  cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    !state.category
                      ? 'border-primary bg-primary/12 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-ring/60 hover:text-foreground'
                  )
                "
                @click="setCategory(null)"
              >
                <span class="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                All topics
              </button>

              <button
                v-for="category in visibleCategories"
                :key="category.id"
                type="button"
                :title="category.fa"
                :aria-pressed="state.category === category.id"
                :class="
                  cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    state.category === category.id
                      ? categoryActive(category.id)
                      : 'border-border bg-card text-muted-foreground hover:border-ring/60 hover:text-foreground'
                  )
                "
                @click="setCategory(category.id)"
              >
                <span
                  :class="cn('size-1.5 rounded-full', categoryDot(category.id))"
                  aria-hidden="true"
                />
                {{ category.label }}
                <span class="tabular-nums opacity-60">{{ category.count }}</span>
              </button>
            </div>
          </ScrollArea>

          <p
            v-if="!visibleCategories.length"
            class="text-xs text-muted-foreground"
          >
            No topics match your search.
          </p>
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
