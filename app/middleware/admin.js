export default defineNuxtRouteMiddleware(async () => {
  const { user, ready, refresh } = useAuth();

  if (!ready.value) {
    const fetcher = import.meta.server ? useRequestFetch() : $fetch;
    await refresh(fetcher);
  }
  if (!user.value) return navigateTo('/login');
  if (user.value.role !== 'admin') return navigateTo('/reader');
});
