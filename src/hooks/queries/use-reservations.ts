"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getReservations,
  getReservationsBySlot,
  getReservationsByDateRange,
  getReservationKPIs,
  createReservation,
  cancelReservation,
} from "@/actions/reservations";
import type { ReservationFilters } from "@/types/reservation";

const TRANSACTIONAL_STALE_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useReservations(filters: ReservationFilters) {
  return useQuery({
    queryKey: ["reservations", filters],
    queryFn: () => getReservations(filters),
    placeholderData: keepPreviousData,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useReservationsBySlot(
  productId: string,
  branchId: string,
  date: string,
  slotStart: string,
  slotEnd?: string
) {
  return useQuery({
    queryKey: ["reservations-slot", productId, branchId, date, slotStart, slotEnd],
    queryFn: () => getReservationsBySlot(productId, branchId, date, slotStart, slotEnd),
    enabled: !!productId && !!branchId && !!date && !!slotStart,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useReservationsByDateRange(
  productId: string | null,
  branchId: string | null,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ["reservations-daterange", productId, branchId, startDate, endDate],
    queryFn: () => getReservationsByDateRange(productId, branchId, startDate, endDate),
    enabled: !!startDate && !!endDate,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useReservationKPIs() {
  return useQuery({
    queryKey: ["reservation-kpis"],
    queryFn: () => getReservationKPIs(),
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createReservation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservation-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      queryClient.invalidateQueries({ queryKey: ["reservations-daterange"] });
      queryClient.invalidateQueries({ queryKey: ["reservations-slot"] });
    },
  });
}

export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      cancelReservation(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservation-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      queryClient.invalidateQueries({ queryKey: ["reservations-daterange"] });
      queryClient.invalidateQueries({ queryKey: ["reservations-slot"] });
    },
  });
}
