"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getExpenseFundStatus,
  adjustExpenseFund,
  getExpenseFundMovements,
} from "@/actions/gastos";
import type { ExpenseFundFilters } from "@/types/gastos";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const TRANSACTIONAL_STALE_MS = 30 * 1000;

export function useExpenseFundStatus() {
  return useQuery({
    queryKey: ["expense-fund-status"],
    queryFn: () => getExpenseFundStatus(),
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useExpenseFundMovements(filters?: ExpenseFundFilters) {
  return useQuery({
    queryKey: ["expense-fund-movements", filters],
    queryFn: () => getExpenseFundMovements(filters),
    placeholderData: keepPreviousData,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useAdjustExpenseFund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { cash_register_id: string; new_amount: number; pin: string }) =>
      adjustExpenseFund(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-fund-status"] });
      queryClient.invalidateQueries({ queryKey: ["expense-fund-movements"] });
    },
  });
}
