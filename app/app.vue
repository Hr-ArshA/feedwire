<script setup>
const { refresh } = useAuth();
const requestFetch = useRequestFetch();
const { locale, dir } = useI18n();

useHead(() => ({
  htmlAttrs: { lang: locale.value, dir: dir.value },
}));

await useAsyncData('session', async () => {
  await refresh(requestFetch);
  return true;
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
