"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getSchedules,
  getScheduleById,
  getSchedulesByProduct,
  getScheduleKPIs,
  getAvailableSlots,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/actions/schedules";
import type { ScheduleFilters } from "@/types/reservation";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useSchedules(filters: ScheduleFilters) {
  return useQuery({
    queryKey: ["schedules", filters],
    queryFn: () => getSchedules(filters),
    placeholderData: keepPreviousData,
  });
}

export function useSchedule(id: string) {
  return useQuery({
    queryKey: ["schedule", id],
    queryFn: () => getScheduleById(id),
    enabled: !!id,
  });
}

export function useSchedulesByProduct(productId: string) {
  return useQuery({
    queryKey: ["schedules-by-product", productId],
    queryFn: () => getSchedulesByProduct(productId),
    enabled: !!productId,
  });
}

export function useScheduleKPIs() {
  return useQuery({
    queryKey: ["schedule-kpis"],
    queryFn: () => getScheduleKPIs(),
  });
}

export function useAvailableSlots(productId: string, branchId: string, date: string) {
  return useQuery({
    queryKey: ["available-slots", productId, branchId, date],
    queryFn: () => getAvailableSlots(productId, branchId, date),
    enabled: !!productId && !!branchId && !!date,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedule-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateSchedule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["schedule-kpis"] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["schedule-kpis"] });
    },
  });
}
