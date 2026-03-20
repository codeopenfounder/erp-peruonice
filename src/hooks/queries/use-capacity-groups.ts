"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getCapacityGroups,
  getCapacityGroupById,
  getCapacityGroupKPIs,
  getAvailableSchedulesForGroup,
  createCapacityGroup,
  updateCapacityGroup,
  deleteCapacityGroup,
} from "@/actions/capacity-groups";
import type { CapacityGroupFilters } from "@/types/capacity-group";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCapacityGroups(filters: CapacityGroupFilters) {
  return useQuery({
    queryKey: ["capacity-groups", filters],
    queryFn: () => getCapacityGroups(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCapacityGroupById(id: string) {
  return useQuery({
    queryKey: ["capacity-group", id],
    queryFn: () => getCapacityGroupById(id),
    enabled: !!id,
  });
}

export function useCapacityGroupKPIs() {
  return useQuery({
    queryKey: ["capacity-group-kpis"],
    queryFn: () => getCapacityGroupKPIs(),
  });
}

export function useAvailableSchedules(branchId: string, excludeGroupId?: string) {
  return useQuery({
    queryKey: ["available-schedules-for-group", branchId, excludeGroupId],
    queryFn: () => getAvailableSchedulesForGroup(branchId, excludeGroupId),
    enabled: !!branchId,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateCapacityGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createCapacityGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capacity-groups"] });
      queryClient.invalidateQueries({ queryKey: ["capacity-group-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["available-schedules-for-group"] });
    },
  });
}

export function useUpdateCapacityGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateCapacityGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capacity-groups"] });
      queryClient.invalidateQueries({ queryKey: ["capacity-group"] });
      queryClient.invalidateQueries({ queryKey: ["capacity-group-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["available-schedules-for-group"] });
    },
  });
}

export function useDeleteCapacityGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCapacityGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capacity-groups"] });
      queryClient.invalidateQueries({ queryKey: ["capacity-group-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["available-schedules-for-group"] });
    },
  });
}
