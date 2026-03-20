"use client";

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
import { getEntityMovements } from "@/actions/inventory-movements";
import type { ProductFilters } from "@/types/product";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ["products", filters],
    queryFn: () => getProducts(filters),
    placeholderData: keepPreviousData,
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
  });
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
    onSuccess: () => {
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

// ---------------------------------------------------------------------------
// Stock Movements
// ---------------------------------------------------------------------------

/** @deprecated Use useEntityMovements("product", productId) from use-inventory-movements instead */
export function useStockMovements(productId: string) {
  return useQuery({
    queryKey: ["stock-movements", productId],
    queryFn: () => getEntityMovements("product", productId),
    enabled: !!productId,
  });
}

// ---------------------------------------------------------------------------
// Pending Approvals (removed — no approval workflow)
// ---------------------------------------------------------------------------

/** @deprecated Approval workflow removed. Returns empty sets for backward compatibility. */
export function usePendingProductApprovals() {
  return useQuery({
    queryKey: ["pending-product-approvals"],
    queryFn: async () => ({
      pendingDeleteProductIds: [] as string[],
      pendingUpdateProductIds: [] as string[],
      pendingDeleteCategoryIds: [] as string[],
      pendingDeleteTagIds: [] as string[],
      pendingDeleteSupplyIds: [] as string[],
      pendingUpdateSupplyIds: [] as string[],
    }),
  });
}
