<script setup>
import { computed, ref } from 'vue';
import { Check, Link2, Rss, Search } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

useSeoMeta({ robots: 'noindex,nofollow' });
useHead({ title: 'Share to Feedwire' });

const route = useRoute();
const { user } = useAuth();
const { addFeed } = useReader();
const { t } = useI18n();

const shared = computed(() => {
  const raw = String(route.query.url || route.query.text || '').trim();
  const match = raw.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : raw;
});
const title = computed(() => String(route.query.title || '').trim());
const looksLikeFeed = computed(() =>
  /(?:\/rss|\/feed|\/atom|\.xml|format=rss|feed=)/i.test(shared.value)
);

const url = ref(shared.value);
const busy = ref(false);
const added = ref(false);
const error = ref(null);

async function add() {
  if (!url.value.trim()) return;
  busy.value = true;
  error.value = null;
  try {
    const ok = await addFeed(url.value.trim());
    if (ok) added.value = true;
  } catch (requestError) {
    error.value = requestError?.data?.error ?? requestError.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl px-4 py-8 pb-24 sm:px-6">
    <div class="rounded-xl border bg-card p-5">
      <div class="flex items-center gap-2">
        <span class="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Rss class="size-4" />
        </span>
        <h1 class="text-lg font-semibold">Share to Feedwire</h1>
      </div>

      <p v-if="title" class="mt-3 text-sm font-medium">{{ title }}</p>

      <div class="mt-4 space-y-2">
        <label class="text-xs font-semibold text-muted-foreground" for="shared-url">
          Link
        </label>
        <Input id="shared-url" v-model="url" placeholder="https://example.com/feed" />
        <div class="flex flex-wrap items-center gap-2">
          <Badge v-if="looksLikeFeed" variant="secondary">Looks like a feed</Badge>
          <Badge v-else variant="outline">Article or site</Badge>
        </div>
      </div>

      <p v-if="error" class="mt-3 text-sm text-destructive">{{ error }}</p>
      <p v-if="added" class="mt-3 flex items-center gap-1.5 text-sm text-primary">
        <Check class="size-4" /> Added to your feeds.
      </p>

      <div class="mt-5 flex flex-wrap gap-2">
        <template v-if="user">
          <Button :disabled="busy || !url.trim()" @click="add">
            <Rss />
            {{ busy ? t('action.loading') : 'Add as feed' }}
          </Button>
          <Button variant="outline" as-child>
            <NuxtLink :to="{ path: '/reader', query: { q: url } }">
              <Search />
              Search my reader
            </NuxtLink>
          </Button>
        </template>
        <template v-else>
          <Button as-child>
            <NuxtLink to="/login">Sign in to add this feed</NuxtLink>
          </Button>
        </template>
        <Button v-if="url" variant="ghost" as-child>
          <a :href="url" target="_blank" rel="noopener noreferrer">
            <Link2 />
            Open link
          </a>
        </Button>
      </div>
    </div>
  </div>
</template>
