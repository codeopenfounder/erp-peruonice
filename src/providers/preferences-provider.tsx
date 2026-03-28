"use client";

import { useEffect } from "react";
import { usePreferences } from "@/hooks/queries/use-preferences";
import { useThemeStore } from "@/stores/theme-store";
import type { FontSize, Locale, Theme } from "@/stores/theme-store";

/**
 * Syncs user preferences from the database into the Zustand theme store.
 * The theme store uses persist middleware (key "poi-theme") which auto-syncs
 * to localStorage. The inline anti-flash script in layout.tsx reads from
 * the same key, eliminating dark mode flash on navigation.
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

    store.setTheme((prefs.theme ?? "light") as Theme);
    store.setFontSize((prefs.font_size ?? "md") as FontSize);
    store.setLocale((prefs.locale ?? "es") as Locale);
    store.setPushEnabled(prefs.push_enabled ?? false);
    store.setQuickAccess(prefs.quick_access ?? []);
    // localStorage write is handled automatically by Zustand persist middleware
  }, [data]);

  return <>{children}</>;
}
