"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getGastosKPIs,
  getCashRegisterStatuses,
  getGastosMovements,
  getClosingHistory,
  getDailyReport,
  addPettyCash,
} from "@/actions/gastos";
import type { GastosFilters, ClosingHistoryFilters } from "@/types/gastos";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useGastosKPIs(date?: string) {
  return useQuery({
    queryKey: ["gastos-kpis", date],
    queryFn: () => getGastosKPIs(date),
  });
}

export function useCashRegisterStatuses() {
  return useQuery({
    queryKey: ["cash-register-statuses"],
    queryFn: () => getCashRegisterStatuses(),
  });
}

export function useGastosMovements(filters: GastosFilters) {
  return useQuery({
    queryKey: ["gastos-movements", filters],
    queryFn: () => getGastosMovements(filters),
    placeholderData: keepPreviousData,
  });
}

export function useClosingHistory(filters?: ClosingHistoryFilters) {
  return useQuery({
    queryKey: ["closing-history", filters],
    queryFn: () => getClosingHistory(filters),
    placeholderData: keepPreviousData,
  });
}

export function useDailyReport(date: string, cashRegisterId?: string) {
  return useQuery({
    queryKey: ["daily-report", date, cashRegisterId],
    queryFn: () => getDailyReport(date, cashRegisterId),
    enabled: !!date,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useAddPettyCash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { cash_register_id: string; amount: number }) =>
      addPettyCash(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-register-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["gastos-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["gastos-movements"] });
    },
  });
}

// Legacy alias
export const useUpdatePettyCash = useAddPettyCash;
