/**
 * App-level client store: theme, language, currency, and reactive subscriptions.
 * Loaded as a single inline script on every page so the UI is responsive instantly.
 */

import { loadData, saveData, subscribe, type AppData } from "../lib/store";
import { DEFAULT_PREFERENCES, type UserPreferences } from "../lib/types";
import type { CurrencyCode } from "../lib/currency";
import type { LangCode } from "../lib/i18n";

type ThemeMode = "light" | "dark" | "system";

const state = {
  data: null as AppData | null,
  theme: "system" as ThemeMode,
};

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  // Update theme-color meta for mobile browsers
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0a0a0a" : "#f3f5f9");
}

function applyLang(lang: LangCode) {
  document.documentElement.lang = lang;
}

function init() {
  const data = loadData();
  state.data = data;
  state.theme = data.preferences.theme;
  applyTheme(state.theme);
  applyLang(data.preferences.language as LangCode);
  document.documentElement.dataset.currency = data.preferences.currency;
  document.documentElement.dataset.lang = data.preferences.language;

  // Watch for system theme changes
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyTheme("system");
  });

  // React to data changes
  subscribe((next) => {
    state.data = next;
    if (next.preferences.theme !== state.theme) {
      state.theme = next.preferences.theme;
      applyTheme(state.theme);
    }
    if (document.documentElement.lang !== next.preferences.language) {
      applyLang(next.preferences.language as LangCode);
    }
    document.documentElement.dataset.currency = next.preferences.currency;
    document.documentElement.dataset.lang = next.preferences.language;
  });
}

function updatePreferences(patch: Partial<UserPreferences>) {
  const data = loadData();
  saveData({
    ...data,
    preferences: { ...data.preferences, ...patch },
  });
}

const api = {
  init,
  setTheme(theme: ThemeMode) {
    state.theme = theme;
    applyTheme(theme);
    updatePreferences({ theme });
  },
  toggleTheme() {
    const resolved = state.theme === "system" ? getSystemTheme() : state.theme;
    const next: ThemeMode = resolved === "dark" ? "light" : "dark";
    api.setTheme(next);
  },
  setLanguage(lang: LangCode) {
    updatePreferences({ language: lang });
  },
  setCurrency(currency: CurrencyCode) {
    updatePreferences({ currency });
  },
  getPreferences(): UserPreferences {
    return loadData().preferences ?? DEFAULT_PREFERENCES;
  },
  getData(): AppData {
    return loadData();
  },
  refresh() {
    saveData({ ...loadData() });
  },
};

declare global {
  interface Window {
    gwp: typeof api;
  }
}

if (typeof window !== "undefined") {
  window.gwp = api;
  // Run as early as possible to avoid FOUC
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}

export default api;
