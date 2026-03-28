"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      fontSize: "md",
      locale: "es",
      theme: "light",
      pushEnabled: false,
      quickAccess: [],

      setFontSize: (fontSize) => set({ fontSize }),
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setPushEnabled: (pushEnabled) => set({ pushEnabled }),
      setQuickAccess: (quickAccess) => set({ quickAccess }),
    }),
    {
      name: "poi-theme",
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        locale: state.locale,
      }),
    }
  )
);
