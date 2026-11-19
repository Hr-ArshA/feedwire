<script setup>
import { HardDriveDownload, LogOut, Rss } from '@lucide/vue';
import { Button } from '@/components/ui/button';

const { user, logout } = useAuth();
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
          <NuxtLink to="/">Home</NuxtLink>
        </Button>
        <Button v-if="user" variant="ghost" size="sm" as-child>
          <NuxtLink to="/reader">My reader</NuxtLink>
        </Button>
        <Button variant="ghost" size="sm" as-child>
          <NuxtLink to="/saved">Offline</NuxtLink>
        </Button>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          class="sm:hidden"
          aria-label="Offline library"
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
            <span class="hidden sm:inline">Sign out</span>
          </Button>
        </template>
        <template v-else>
          <Button variant="ghost" size="sm" as-child>
            <NuxtLink to="/login">Sign in</NuxtLink>
          </Button>
          <Button size="sm" as-child>
            <NuxtLink to="/register">Create account</NuxtLink>
          </Button>
        </template>
      </div>
    </div>
  </header>
</template>
