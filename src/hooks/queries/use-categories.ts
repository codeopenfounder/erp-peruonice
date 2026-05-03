"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createTag,
  updateTag,
  deleteTag,
} from "@/actions/categories";

const INVENTORY_STALE_TIME = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCategories(type?: string) {
  return useQuery({
    queryKey: ["categories", type],
    queryFn: () => getCategories(type),
    staleTime: INVENTORY_STALE_TIME,
  });
}

export function usePrefetchCategories() {
  const queryClient = useQueryClient();

  return useCallback((type?: string) =>
    queryClient.prefetchQuery({
      queryKey: ["categories", type],
      queryFn: () => getCategories(type),
      staleTime: INVENTORY_STALE_TIME,
    }), [queryClient]);
}

// ---------------------------------------------------------------------------
// Category Mutations
// ---------------------------------------------------------------------------

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["categories"], type: "active" }),
        queryClient.refetchQueries({ queryKey: ["products"], type: "active" }),
        queryClient.refetchQueries({ queryKey: ["product-kpis"], type: "active" }),
      ]);
    },
  });
}

// ---------------------------------------------------------------------------
// Tag Mutations
// ---------------------------------------------------------------------------

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateTag(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["categories"], type: "active" }),
        queryClient.refetchQueries({ queryKey: ["products"], type: "active" }),
      ]);
    },
  });
}
