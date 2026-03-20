"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { DashboardFilters, TimeGranularity } from "@/types/kpi";

function peruToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

interface FiltersContextValue {
  filters: DashboardFilters;
  setFilters: (updates: Partial<DashboardFilters>) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function useDashboardFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx)
    throw new Error(
      "useDashboardFilters must be used within DashboardFiltersProvider"
    );
  return ctx;
}

export function DashboardFiltersProvider({
  children,
}: {
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const today = peruToday();

  const filters: DashboardFilters = {
    date_from: searchParams.get("from") || today,
    date_to: searchParams.get("to") || today,
    branch_id: searchParams.get("branch") || undefined,
    granularity: (searchParams.get("g") as TimeGranularity) || "daily",
  };

  const activeTab = searchParams.get("tab") || "ventas";

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const setFilters = useCallback(
    (updates: Partial<DashboardFilters>) => {
      const mapped: Record<string, string | undefined> = {};
      if (updates.date_from !== undefined) mapped.from = updates.date_from;
      if (updates.date_to !== undefined) mapped.to = updates.date_to;
      if (updates.branch_id !== undefined)
        mapped.branch = updates.branch_id || undefined;
      if (updates.granularity !== undefined) mapped.g = updates.granularity;
      updateParams(mapped);
    },
    [updateParams]
  );

  const setActiveTab = useCallback(
    (tab: string) => {
      updateParams({ tab });
    },
    [updateParams]
  );

  return (
    <FiltersContext.Provider
      value={{ filters, setFilters, activeTab, setActiveTab }}
    >
      {children}
    </FiltersContext.Provider>
  );
}
