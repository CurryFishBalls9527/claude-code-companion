import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'dark' | 'light';

function createThemeStore() {
  const initial: Theme = browser
    ? (localStorage.getItem('theme') as Theme) ?? 'dark'
    : 'dark';

  const { subscribe, set, update } = writable<Theme>(initial);

  if (browser) {
    document.documentElement.classList.toggle('light', initial === 'light');
  }

  return {
    subscribe,
    toggle() {
      update((current) => {
        const next: Theme = current === 'dark' ? 'light' : 'dark';
        if (browser) {
          localStorage.setItem('theme', next);
          document.documentElement.classList.toggle('light', next === 'light');
        }
        return next;
      });
    },
    set(theme: Theme) {
      set(theme);
      if (browser) {
        localStorage.setItem('theme', theme);
        document.documentElement.classList.toggle('light', theme === 'light');
      }
    },
  };
}

export const theme = createThemeStore();
