"use client";

import { create } from "zustand";

export type FontSize = "sm" | "md" | "lg";
export type Locale = "es" | "en";
export type Theme = "dark" | "light" | "system";

interface ThemeState {
  fontSize: FontSize;
  locale: Locale;
  theme: Theme;
  pushEnabled: boolean;
  quickAccess: string[];

  setFontSize: (fontSize: FontSize) => void;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setPushEnabled: (enabled: boolean) => void;
  setQuickAccess: (quickAccess: string[]) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  fontSize: "md",
  locale: "es",
  theme: "dark",
  pushEnabled: false,
  quickAccess: [],

  setFontSize: (fontSize) => set({ fontSize }),
  setLocale: (locale) => set({ locale }),
  setTheme: (theme) => set({ theme }),
  setPushEnabled: (pushEnabled) => set({ pushEnabled }),
  setQuickAccess: (quickAccess) => set({ quickAccess }),
}));
