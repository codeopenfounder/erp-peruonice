"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getSales, getSalesKPIs } from "@/actions/sales";
import type { SalesFilters } from "@/types/sale";

export function useSales(filters: SalesFilters) {
  return useQuery({
    queryKey: ["sales", filters],
    queryFn: () => getSales(filters),
    placeholderData: keepPreviousData,
  });
}

export function useSalesKPIs(date?: string) {
  return useQuery({
    queryKey: ["sales-kpis", date],
    queryFn: () => getSalesKPIs(date),
  });
}
