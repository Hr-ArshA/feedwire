import { ACCENTS, FONTS, TEXT_SIZES } from '@/lib/appearance.js';

const STORAGE_KEY = 'fw:appearance';

export const APPEARANCE_DEFAULTS = {
  theme: 'system',
  accent: 'orange',
  font: 'sans',
  size: 'md',
};

function setClass(root, prefix, values, active) {
  for (const value of values) {
    root.classList.toggle(`${prefix}${value}`, value === active);
  }
}

/**
 * Reader appearance (theme, accent, font, text size) is a device preference:
 * it lives in localStorage and is expressed purely as classes on <html>, so
 * every colour still comes from the tokens in main.css.
 */
export function useAppearance() {
  const prefs = useState('appearance', () => ({ ...APPEARANCE_DEFAULTS }));

  function apply() {
    if (!import.meta.client) return;
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark =
      prefs.value.theme === 'dark' ||
      (prefs.value.theme === 'system' && systemDark);

    root.classList.toggle('dark', dark);
    setClass(root, 'app-accent-', ACCENTS.map((entry) => entry.id), prefs.value.accent);
    setClass(root, 'app-font-', FONTS.map((entry) => entry.id), prefs.value.font);
    setClass(root, 'app-size-', TEXT_SIZES.map((entry) => entry.id), prefs.value.size);
  }

  function persist() {
    if (!import.meta.client) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs.value));
    } catch {
      /* private mode */
    }
  }

  function init() {
    if (!import.meta.client) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) prefs.value = { ...APPEARANCE_DEFAULTS, ...JSON.parse(raw) };
    } catch {
      /* ignore malformed prefs */
    }
    apply();
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (prefs.value.theme === 'system') apply();
      });
  }

  function update(patch) {
    prefs.value = { ...prefs.value, ...patch };
    persist();
    apply();
  }

  function reset() {
    prefs.value = { ...APPEARANCE_DEFAULTS };
    persist();
    apply();
  }

  return { prefs, init, update, reset, apply };
}
