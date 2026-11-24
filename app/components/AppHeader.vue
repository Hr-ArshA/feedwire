<script setup>
import { HardDriveDownload, LogOut, Rss } from '@lucide/vue';
import { Button } from '@/components/ui/button';

const { user, logout } = useAuth();
const { t } = useI18n();

const isAdmin = computed(() => user.value?.role === 'admin');
</script>

<template>
  <header
    class="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md print:hidden"
  >
    <div
      class="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3 sm:px-6"
    >
      <NuxtLink to="/" class="flex shrink-0 items-center gap-2.5 outline-none">
        <span
          class="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
        >
          <Rss class="size-4" />
        </span>
        <span class="text-base font-semibold tracking-tight">Feedwire</span>
      </NuxtLink>

      <nav class="ml-4 hidden items-center gap-1 sm:flex">
        <Button variant="ghost" size="sm" as-child>
          <NuxtLink to="/">{{ t('nav.home') }}</NuxtLink>
        </Button>
        <Button variant="ghost" size="sm" as-child>
          <NuxtLink to="/explore">{{ t('nav.explore') }}</NuxtLink>
        </Button>
        <Button variant="ghost" size="sm" as-child>
          <NuxtLink to="/saved">{{ t('nav.offline') }}</NuxtLink>
        </Button>
        <Button variant="ghost" size="sm" as-child>
          <NuxtLink to="/settings">{{ t('nav.settings') }}</NuxtLink>
        </Button>
        <Button v-if="isAdmin" variant="ghost" size="sm" as-child>
          <NuxtLink to="/admin">{{ t('nav.admin') }}</NuxtLink>
        </Button>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          class="sm:hidden"
          :aria-label="t('nav.offline')"
          as-child
        >
          <NuxtLink to="/saved">
            <HardDriveDownload />
          </NuxtLink>
        </Button>
        <template v-if="user">
          <span class="hidden max-w-[180px] truncate text-xs text-muted-foreground sm:inline">
            {{ user.displayName || user.email }}
          </span>
          <Button variant="outline" size="sm" @click="logout">
            <LogOut />
            <span class="hidden sm:inline">{{ t('action.signOut') }}</span>
          </Button>
        </template>
        <template v-else>
          <Button variant="ghost" size="sm" as-child>
            <NuxtLink to="/login">{{ t('action.signIn') }}</NuxtLink>
          </Button>
          <Button size="sm" as-child>
            <NuxtLink to="/register">{{ t('action.createAccount') }}</NuxtLink>
          </Button>
        </template>
      </div>
    </div>
  </header>
</template>
