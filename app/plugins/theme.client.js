export default defineNuxtPlugin(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.documentElement.classList.toggle('dark', media.matches);
  };
  apply();
  media.addEventListener('change', apply);
});
