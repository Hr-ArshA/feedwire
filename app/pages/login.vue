<script setup>
import { ref } from 'vue';
import { Loader2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

useHead({ title: 'Sign in · Feedwire' });

const { login } = useAuth();

const email = ref('');
const password = ref('');
const error = ref('');
const pending = ref(false);

async function submit() {
  error.value = '';
  pending.value = true;
  try {
    await login(email.value.trim(), password.value);
    await navigateTo('/reader');
  } catch (err) {
    error.value = err?.data?.error ?? err?.statusMessage ?? 'Could not sign in';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-[420px] flex-col px-4 py-12 sm:px-6">
    <h1 class="text-2xl font-bold tracking-tight">Welcome back</h1>
    <p class="mt-1.5 text-sm text-muted-foreground">
      Sign in to reach your feeds, read state and favourites.
    </p>

    <form class="mt-6 flex flex-col gap-3" @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <label for="email" class="text-xs font-semibold text-muted-foreground">
          Email
        </label>
        <Input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          placeholder="you@example.com"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="password" class="text-xs font-semibold text-muted-foreground">
          Password
        </label>
        <Input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          placeholder="••••••••"
        />
      </div>

      <p
        v-if="error"
        class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        {{ error }}
      </p>

      <Button type="submit" class="mt-1 w-full" :disabled="pending">
        <Loader2 v-if="pending" class="animate-spin" />
        {{ pending ? 'Signing in…' : 'Sign in' }}
      </Button>
    </form>

    <p class="mt-5 text-center text-xs text-muted-foreground">
      No account yet?
      <NuxtLink to="/register" class="font-semibold text-primary hover:underline">
        Create one
      </NuxtLink>
    </p>
  </div>
</template>
