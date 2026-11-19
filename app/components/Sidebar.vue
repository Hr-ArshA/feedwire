<script setup>
import { computed } from 'vue';
import { Settings } from '@lucide/vue';
import { categoryActive, categoryDot } from '@/lib/categories.js';
import { cn } from '@/lib/utils';

const { state, setCategory } = useReader();

const visibleCategories = computed(() =>
  state.value.categories.filter(
    (category) => category.count || state.value.category === category.id
  )
);
</script>

<template>
  <aside
    class="sticky top-[86px] hidden max-h-[calc(100dvh-104px)] flex-col gap-4 overflow-y-auto pr-1 pb-4 lg:flex"
  >
    <div class="flex flex-col gap-2">
      <FiltersDialog class="w-full" />
      <AddFeedDialog class="w-full" />
    </div>

    <FeedPicker />

    <div>
      <p
        class="mb-2 px-2.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase"
      >
        Topics
      </p>
      <ul class="flex flex-col gap-0.5">
        <li>
          <button
            type="button"
            :aria-pressed="!state.category"
            :class="
              cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                !state.category
                  ? 'bg-primary/12 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )
            "
            @click="setCategory(null)"
          >
            <span class="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            All topics
          </button>
        </li>
        <li v-for="category in visibleCategories" :key="category.id">
          <button
            type="button"
            :title="category.fa"
            :aria-pressed="state.category === category.id"
            :class="
              cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                state.category === category.id
                  ? cn('font-semibold', categoryActive(category.id))
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )
            "
            @click="setCategory(category.id)"
          >
            <span
              :class="cn('size-1.5 rounded-full', categoryDot(category.id))"
              aria-hidden="true"
            />
            <span class="truncate">{{ category.label }}</span>
            <span class="ml-auto text-xs tabular-nums opacity-60">
              {{ category.count }}
            </span>
          </button>
        </li>
      </ul>
    </div>

    <NuxtLink
      to="/settings"
      class="mt-auto flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <Settings class="size-4" />
      Settings
    </NuxtLink>
  </aside>
</template>
