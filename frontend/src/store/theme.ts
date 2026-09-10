import { create } from 'zustand'

const STORAGE_KEY = 'raglab_theme_mode'
export type ThemeMode = 'dark' | 'light'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
}

function readInitialMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* ignore */
  }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  return prefersDark ? 'dark' : 'light'
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readInitialMode(),
  setMode: (mode) => {
    set({ mode })
    try {
      window.localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = mode
  },
  toggleMode: () => get().setMode(get().mode === 'dark' ? 'light' : 'dark'),
}))

if (typeof window !== 'undefined') {
  document.documentElement.dataset.theme = useThemeStore.getState().mode
}
