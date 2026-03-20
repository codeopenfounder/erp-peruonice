"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/theme-store";

const FONT_SIZE_MAP = {
  sm: "14px",
  md: "16px",
  lg: "18px",
} as const;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { fontSize, theme } = useThemeStore();

  // Apply font size
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_MAP[fontSize];
  }, [fontSize]);

  // Apply theme (dark/light/system)
  useEffect(() => {
    const root = document.documentElement;

    function applyDark(dark: boolean) {
      if (dark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    if (theme === "dark") {
      applyDark(true);
    } else if (theme === "light") {
      applyDark(false);
    } else {
      // system
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      applyDark(mq.matches);

      const handler = (e: MediaQueryListEvent) => applyDark(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  return <>{children}</>;
}
