"use client";

import { useEffect } from "react";
import { usePreferences } from "@/hooks/queries/use-preferences";
import { useThemeStore } from "@/stores/theme-store";
import type { FontSize, Locale, Theme } from "@/stores/theme-store";

/**
 * Syncs user preferences from the database into the Zustand theme store.
 * Also writes to localStorage so the inline anti-flash script in layout.tsx
 * can read the theme before React hydrates.
 *
 * Only hydrates when real DB data arrives (has "id" field),
 * ignoring server-side defaults that lack it.
 */
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { data } = usePreferences();

  useEffect(() => {
    if (!data?.data) return;

    const prefs = data.data;

    // Only hydrate with real DB rows (they have an "id" field).
    // The server action returns plain defaults (no id) when no row exists yet.
    if (!("id" in prefs)) return;

    const store = useThemeStore.getState();

    store.setTheme((prefs.theme ?? "dark") as Theme);
    store.setFontSize((prefs.font_size ?? "md") as FontSize);
    store.setLocale((prefs.locale ?? "es") as Locale);
    store.setPushEnabled(prefs.push_enabled ?? false);
    store.setQuickAccess(prefs.quick_access ?? []);

    // Write to localStorage for the inline anti-flash script
    try {
      localStorage.setItem(
        "poi-theme",
        JSON.stringify({ state: { theme: prefs.theme ?? "dark" } })
      );
    } catch {
      // localStorage not available
    }
  }, [data]);

  return <>{children}</>;
}
