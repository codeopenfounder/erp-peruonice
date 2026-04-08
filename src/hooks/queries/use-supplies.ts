"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getSupplies,
  getSupplyById,
  getSupplyKPIs,
  createSupply,
  updateSupply,
  deleteSupply,
  addSupplyStock,
} from "@/actions/supplies";
import type { SupplyFilters } from "@/types/supply";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useSupplies(filters: SupplyFilters) {
  return useQuery({
    queryKey: ["supplies", filters],
    queryFn: () => getSupplies(filters),
    placeholderData: keepPreviousData,
  });
}

export function useSupply(id: string) {
  return useQuery({
    queryKey: ["supply", id],
    queryFn: () => getSupplyById(id),
    enabled: !!id,
  });
}

export function useSupplyKPIs() {
  return useQuery({
    queryKey: ["supply-kpis"],
    queryFn: () => getSupplyKPIs(),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateSupply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createSupply(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      queryClient.invalidateQueries({ queryKey: ["supply-kpis"] });
    },
  });
}

export function useUpdateSupply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateSupply(id, data),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      queryClient.invalidateQueries({ queryKey: ["supply", id] });
      queryClient.invalidateQueries({ queryKey: ["supply-kpis"] });
    },
  });
}

export function useDeleteSupply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSupply(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["supplies"] });
      const previous = queryClient.getQueriesData({ queryKey: ["supplies"] });
      queryClient.setQueriesData(
        { queryKey: ["supplies"] },
        (old: { data: { id: string }[]; total: number } | undefined) => {
          if (!old?.data) return old;
          return { ...old, data: old.data.filter((s) => s.id !== id), total: Math.max(0, old.total - 1) };
        },
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      context?.previous?.forEach(([key, data]: [unknown, unknown]) =>
        queryClient.setQueryData(key as string[], data),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      queryClient.invalidateQueries({ queryKey: ["supply-kpis"] });
    },
  });
}

export function useAddSupplyStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ supplyId, data }: { supplyId: string; data: unknown }) =>
      addSupplyStock(supplyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      queryClient.invalidateQueries({ queryKey: ["supply"] });
      queryClient.invalidateQueries({ queryKey: ["supply-kpis"] });
    },
  });
}
