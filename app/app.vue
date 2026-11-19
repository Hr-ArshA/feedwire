<script setup>
const { refresh } = useAuth();
const requestFetch = useRequestFetch();

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
