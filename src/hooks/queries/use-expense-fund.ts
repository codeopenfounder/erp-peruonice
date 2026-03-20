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

export function useExpenseFundStatus() {
  return useQuery({
    queryKey: ["expense-fund-status"],
    queryFn: () => getExpenseFundStatus(),
  });
}

export function useExpenseFundMovements(filters?: ExpenseFundFilters) {
  return useQuery({
    queryKey: ["expense-fund-movements", filters],
    queryFn: () => getExpenseFundMovements(filters),
    placeholderData: keepPreviousData,
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
