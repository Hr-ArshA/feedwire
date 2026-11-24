<script setup>
import { ref } from 'vue';
import { Loader2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

useHead({ title: 'Create account · Feedwire' });

useSeoMeta({ robots: 'noindex,nofollow' });

const { register } = useAuth();

const displayName = ref('');
const email = ref('');
const password = ref('');
const confirm = ref('');
const error = ref('');
const pending = ref(false);

async function submit() {
  error.value = '';
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters';
    return;
  }
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match';
    return;
  }

  pending.value = true;
  try {
    await register({
      email: email.value.trim(),
      password: password.value,
      displayName: displayName.value.trim(),
    });
    await navigateTo('/reader');
  } catch (err) {
    error.value = err?.data?.error ?? err?.statusMessage ?? 'Could not create the account';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-[420px] flex-col px-4 py-12 sm:px-6">
    <h1 class="text-2xl font-bold tracking-tight">Create your account</h1>
    <p class="mt-1.5 text-sm text-muted-foreground">
      You start subscribed to Hacker News — add any other feed afterwards.
    </p>

    <form class="mt-6 flex flex-col gap-3" @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <label for="name" class="text-xs font-semibold text-muted-foreground">
          Display name <span class="font-normal">(optional)</span>
        </label>
        <Input
          id="name"
          v-model="displayName"
          autocomplete="nickname"
          placeholder="Ada"
        />
      </div>

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
          autocomplete="new-password"
          required
          minlength="8"
          placeholder="At least 8 characters"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="confirm" class="text-xs font-semibold text-muted-foreground">
          Confirm password
        </label>
        <Input
          id="confirm"
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          required
          placeholder="Repeat it"
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
        {{ pending ? 'Creating…' : 'Create account' }}
      </Button>
    </form>

    <p class="mt-5 text-center text-xs text-muted-foreground">
      Already registered?
      <NuxtLink to="/login" class="font-semibold text-primary hover:underline">
        Sign in
      </NuxtLink>
    </p>
  </div>
</template>
