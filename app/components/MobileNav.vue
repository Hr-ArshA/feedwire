<script setup>
import { computed, onMounted, watch } from 'vue';
import {
  Compass,
  HardDriveDownload,
  Layers,
  Search,
  Settings,
  ShieldCheck,
} from '@lucide/vue';
import { cn } from '@/lib/utils';

const props = defineProps({
  active: { type: String, default: 'reader' },
});

const emit = defineEmits(['search']);

const { user } = useAuth();
const { t } = useI18n();
const isAdmin = computed(() => user.value?.role === 'admin');

const { state, loadFeeds } = useReader();
const unread = computed(() => state.value.stats?.unread ?? 0);

onMounted(() => {
  if (!state.value.stats?.total) loadFeeds().catch(() => {});
});

// Badging API: show the unread count on the installed app icon.
watch(
  unread,
  (value) => {
    if (import.meta.server || !('setAppBadge' in navigator)) return;
    if (value > 0) navigator.setAppBadge(value).catch(() => {});
    else navigator.clearAppBadge?.().catch(() => {});
  },
  { immediate: true }
);

function itemClass(isActive) {
  return cn(
    'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md py-2 text-[10.5px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
    isActive
      ? 'text-primary'
      : 'text-muted-foreground hover:text-foreground'
  );
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] print:hidden lg:hidden"
    :aria-label="t('nav.mobile')"
  >
    <div class="mx-auto flex max-w-md items-stretch justify-around px-1">
      <NuxtLink
        to="/reader"
        :class="itemClass(props.active === 'reader')"
        class="relative"
      >
        <Layers class="size-5" />
        {{ t('nav.reader') }}
        <span
          v-if="unread"
          class="absolute right-1/4 top-0.5 rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground tabular-nums"
        >
          {{ unread > 99 ? '99+' : unread }}
        </span>
      </NuxtLink>
      <NuxtLink to="/explore" :class="itemClass(props.active === 'explore')">
        <Compass class="size-5" />
        {{ t('nav.explore') }}
      </NuxtLink>
      <button
        type="button"
        :class="itemClass(false)"
        :aria-label="t('nav.search')"
        @click="emit('search')"
      >
        <Search class="size-5" />
        {{ t('nav.search') }}
      </button>
      <NuxtLink to="/saved" :class="itemClass(props.active === 'offline')">
        <HardDriveDownload class="size-5" />
        {{ t('nav.offline') }}
      </NuxtLink>
      <NuxtLink to="/settings" :class="itemClass(props.active === 'settings')">
        <Settings class="size-5" />
        {{ t('nav.settings') }}
      </NuxtLink>
      <NuxtLink
        v-if="isAdmin"
        to="/admin"
        :class="itemClass(props.active === 'admin')"
      >
        <ShieldCheck class="size-5" />
        {{ t('nav.admin') }}
      </NuxtLink>
    </div>
  </nav>
</template>
