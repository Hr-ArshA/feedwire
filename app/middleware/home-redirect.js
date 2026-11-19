/**
 * Signed-in readers land straight in their own reader; the public Hacker News
 * page stays the landing page for guests.
 */
export default defineNuxtRouteMiddleware(async () => {
  const { user, ready, refresh } = useAuth();

  if (!ready.value) {
    const fetcher = import.meta.server ? useRequestFetch() : $fetch;
    await refresh(fetcher);
  }
  if (user.value) {
    return navigateTo('/reader', { replace: true });
  }
});
