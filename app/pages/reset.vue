<script setup>
import { computed, ref } from 'vue';
import { ArrowLeft, Loader2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

useHead({ title: 'Choose a new password · Feedwire' });
useSeoMeta({ robots: 'noindex,nofollow' });

const route = useRoute();
const token = computed(() => String(route.query.token ?? '').trim());

const password = ref('');
const confirm = ref('');
const error = ref('');
const pending = ref(false);

async function submit() {
  error.value = '';
  if (!token.value) {
    error.value = 'This reset link is missing its token. Request a new one.';
    return;
  }
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
    await $fetch('/api/auth/reset', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    });
    const { refresh } = useAuth();
    await refresh();
    await navigateTo('/reader');
  } catch (err) {
    error.value =
      err?.data?.error ?? err?.statusMessage ?? 'Could not reset the password';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-[420px] flex-col px-4 py-12 sm:px-6">
    <h1 class="text-2xl font-bold tracking-tight">Choose a new password</h1>
    <p class="mt-1.5 text-sm text-muted-foreground">
      Your other sessions will be signed out once the new password is saved.
    </p>

    <form class="mt-6 flex flex-col gap-3" @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <label for="password" class="text-xs font-semibold text-muted-foreground">
          New password
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
          Confirm new password
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
        {{ pending ? 'Saving…' : 'Save new password' }}
      </Button>
    </form>

    <div class="mt-5 flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <NuxtLink to="/forgot" class="font-semibold text-primary hover:underline">
        Request a new link
      </NuxtLink>
      <NuxtLink to="/login" class="inline-flex items-center gap-1 hover:underline">
        <ArrowLeft class="size-3" />
        Back to sign in
      </NuxtLink>
    </div>
  </div>
</template>
