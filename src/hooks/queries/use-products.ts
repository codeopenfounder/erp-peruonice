"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getProducts,
  getProductById,
  getProductKPIs,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
} from "@/actions/products";
import type { ProductFilters } from "@/types/product";

const INVENTORY_STALE_TIME = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ["products", filters],
    queryFn: () => getProducts(filters),
    placeholderData: keepPreviousData,
    staleTime: INVENTORY_STALE_TIME,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => getProductById(id),
    enabled: !!id,
  });
}

export function useProductKPIs() {
  return useQuery({
    queryKey: ["product-kpis"],
    queryFn: () => getProductKPIs(),
    staleTime: INVENTORY_STALE_TIME,
  });
}

export function usePrefetchProducts() {
  const queryClient = useQueryClient();

  return useCallback((filters: ProductFilters) =>
    queryClient.prefetchQuery({
      queryKey: ["products", filters],
      queryFn: () => getProducts(filters),
      staleTime: INVENTORY_STALE_TIME,
    }), [queryClient]);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateProduct(id, data),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["product-kpis"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["products"] });
      const previous = queryClient.getQueriesData({ queryKey: ["products"] });
      queryClient.setQueriesData(
        { queryKey: ["products"] },
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
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useUpdateProductStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      updateProductStock(id, quantity),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["product-kpis"] });
    },
  });
}

export function useAddProductStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, data }: { productId: string; data: unknown }) => {
      const { addProductStock } = await import("@/actions/products");
      return addProductStock(productId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Recipe Items (composite products)
// ---------------------------------------------------------------------------

export function useRecipeItems(productId: string) {
  return useQuery({
    queryKey: ["recipe-items", productId],
    queryFn: async () => {
      const { getProductById } = await import("@/actions/products");
      const product = await getProductById(productId);
      return product?.recipe_items || [];
    },
    enabled: !!productId,
  });
}
