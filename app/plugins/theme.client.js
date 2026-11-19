/**
 * Applies the saved appearance (theme, accent, font, text size) before the app
 * mounts, so the first paint already uses the reader's chosen look.
 */
export default defineNuxtPlugin(() => {
  useAppearance().init();
});
