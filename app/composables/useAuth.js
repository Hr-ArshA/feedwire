export function useAuth() {
  const user = useState('auth:user', () => null);
  const ready = useState('auth:ready', () => false);

  async function refresh(fetcher = $fetch) {
    try {
      const data = await fetcher('/api/auth/session');
      user.value = data.user ?? null;
    } catch {
      user.value = null;
    } finally {
      ready.value = true;
    }
    return user.value;
  }

  async function login(email, password) {
    const data = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    user.value = data.user;
    ready.value = true;
    return data.user;
  }

  async function register({ email, password, displayName }) {
    const data = await $fetch('/api/auth/register', {
      method: 'POST',
      body: { email, password, displayName },
    });
    user.value = data.user;
    ready.value = true;
    return data.user;
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    user.value = null;
    await navigateTo('/');
  }

  return { user, ready, refresh, login, register, logout };
}
