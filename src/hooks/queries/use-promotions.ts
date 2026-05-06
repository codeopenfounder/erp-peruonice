"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getPromotions,
  getPromotionById,
  getPromotionKPIs,
  createPromotion,
  updatePromotion,
  deletePromotion,
} from "@/actions/promotions";
import type { PromotionFilters } from "@/types/promotion";

const CATALOG_STALE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePromotions(filters: PromotionFilters) {
  return useQuery({
    queryKey: ["promotions", filters],
    queryFn: () => getPromotions(filters),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_MS,
  });
}

export function usePromotion(id: string) {
  return useQuery({
    queryKey: ["promotion", id],
    queryFn: () => getPromotionById(id),
    enabled: !!id,
    staleTime: CATALOG_STALE_MS,
  });
}

export function usePromotionKPIs() {
  return useQuery({
    queryKey: ["promotion-kpis"],
    queryFn: () => getPromotionKPIs(),
    staleTime: CATALOG_STALE_MS,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreatePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createPromotion(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      queryClient.invalidateQueries({ queryKey: ["promotion-kpis"] });
    },
  });
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updatePromotion(id, data),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      queryClient.invalidateQueries({ queryKey: ["promotion", id] });
      queryClient.invalidateQueries({ queryKey: ["promotion-kpis"] });
    },
  });
}

export function useDeletePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePromotion(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["promotions"] });
      const previous = queryClient.getQueriesData({ queryKey: ["promotions"] });
      queryClient.setQueriesData(
        { queryKey: ["promotions"] },
        (old: { data: { id: string }[]; total: number } | undefined) => {
          if (!old?.data) return old;
          return { ...old, data: old.data.filter((p) => p.id !== id), total: Math.max(0, old.total - 1) };
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
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      queryClient.invalidateQueries({ queryKey: ["promotion-kpis"] });
    },
  });
}
