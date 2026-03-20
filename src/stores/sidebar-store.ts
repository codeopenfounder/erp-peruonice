"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  expandedSections: Record<string, boolean>;
  isCollapsed: boolean;

  toggleSection: (key: string) => void;
  toggleCollapse: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      expandedSections: {
        ventas: true,
      },
      isCollapsed: false,

      toggleSection: (key) =>
        set((state) => ({
          expandedSections: {
            ...state.expandedSections,
            [key]: !state.expandedSections[key],
          },
        })),

      toggleCollapse: () =>
        set((state) => ({ isCollapsed: !state.isCollapsed })),

      setCollapsed: (isCollapsed) => set({ isCollapsed }),
    }),
    {
      name: "poi-sidebar",
    }
  )
);
