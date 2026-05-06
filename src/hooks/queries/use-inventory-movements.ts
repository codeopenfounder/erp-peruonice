"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getInventoryMovements,
  getEntityMovements,
  createInventoryMovement,
  getMovementKPIs,
} from "@/actions/inventory-movements";
import type { EntityType, InventoryMovementFilters } from "@/types/inventory-movement";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useInventoryMovements(filters: InventoryMovementFilters) {
  return useQuery({
    queryKey: ["inventory-movements", filters],
    queryFn: () => getInventoryMovements(filters),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useEntityMovements(entityType: EntityType, entityId: string) {
  return useQuery({
    queryKey: ["entity-movements", entityType, entityId],
    queryFn: () => getEntityMovements(entityType, entityId, 10),
    enabled: !!entityId,
    staleTime: 30_000,
  });
}

export function useMovementKPIs() {
  return useQuery({
    queryKey: ["movement-kpis"],
    queryFn: () => getMovementKPIs(),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateInventoryMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createInventoryMovement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      queryClient.invalidateQueries({ queryKey: ["movement-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
    },
  });
}
