<script setup>
import { ref } from 'vue';
import { ArrowLeft, Loader2, MailCheck } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

useHead({ title: 'Reset password · Feedwire' });
useSeoMeta({ robots: 'noindex,nofollow' });

const email = ref('');
const pending = ref(false);
const sent = ref(false);
const error = ref('');
const devLink = ref(null);

async function submit() {
  error.value = '';
  pending.value = true;
  try {
    const data = await $fetch('/api/auth/forgot', {
      method: 'POST',
      body: { email: email.value.trim() },
    });
    devLink.value = data?.resetUrl ?? null;
    sent.value = true;
  } catch (err) {
    error.value =
      err?.data?.error ?? err?.statusMessage ?? 'Could not send the reset link';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-[420px] flex-col px-4 py-12 sm:px-6">
    <h1 class="text-2xl font-bold tracking-tight">Reset your password</h1>
    <p class="mt-1.5 text-sm text-muted-foreground">
      Enter the email you signed up with and we will send a single-use reset
      link that stays valid for one hour.
    </p>

    <div
      v-if="sent"
      class="mt-6 flex flex-col gap-3 rounded-xl border bg-card px-4 py-5"
    >
      <div class="flex items-center gap-2 text-sm font-semibold">
        <MailCheck class="size-4 text-primary" />
        Check your inbox
      </div>
      <p class="text-sm leading-relaxed text-muted-foreground">
        If an account exists for that address, a reset link is on its way. The
        link can only be used once.
      </p>
      <div v-if="devLink" class="flex flex-col gap-2 rounded-lg border border-dashed p-3">
        <p class="text-xs text-muted-foreground">
          No mail provider is configured on this server, so here is the link
          directly:
        </p>
        <Button as-child size="sm" class="self-start">
          <NuxtLink :to="devLink">Open reset link</NuxtLink>
        </Button>
      </div>
      <Button variant="outline" size="sm" class="self-start" as-child>
        <NuxtLink to="/login">
          <ArrowLeft />
          Back to sign in
        </NuxtLink>
      </Button>
    </div>

    <form v-else class="mt-6 flex flex-col gap-3" @submit.prevent="submit">
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

      <p
        v-if="error"
        class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        {{ error }}
      </p>

      <Button type="submit" class="mt-1 w-full" :disabled="pending">
        <Loader2 v-if="pending" class="animate-spin" />
        {{ pending ? 'Sending…' : 'Send reset link' }}
      </Button>
    </form>

    <p v-if="!sent" class="mt-5 text-center text-xs text-muted-foreground">
      Remembered it?
      <NuxtLink to="/login" class="font-semibold text-primary hover:underline">
        Sign in
      </NuxtLink>
    </p>
  </div>
</template>
