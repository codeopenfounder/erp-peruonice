"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getFactConfig,
  saveFactConfig,
  getInvoiceSeries,
  createInvoiceSeries,
  updateInvoiceSeries,
  deleteInvoiceSeries,
  getCashRegisters,
  createCashRegister,
  updateCashRegister,
  deleteCashRegister,
  getFactUsers,
  createFactUserAssignment,
  updateFactUserAssignment,
  deleteFactUserAssignment,
  getEmployeesForFactAssignment,
} from "@/actions/fact-config";

const CONFIG_STALE_MS = 10 * 60 * 1000;

// Config
export function useFactConfig() {
  return useQuery({ queryKey: ["fact-config"], queryFn: getFactConfig, staleTime: CONFIG_STALE_MS });
}

export function useSaveFactConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => saveFactConfig(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fact-config"] }),
  });
}

// Series
export function useInvoiceSeries() {
  return useQuery({ queryKey: ["invoice-series"], queryFn: getInvoiceSeries, staleTime: CONFIG_STALE_MS });
}

export function useCreateInvoiceSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createInvoiceSeries(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice-series"] }),
  });
}

export function useUpdateInvoiceSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateInvoiceSeries(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice-series"] }),
  });
}

export function useDeleteInvoiceSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInvoiceSeries(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice-series"] }),
  });
}

// Cash Registers
export function useCashRegisters() {
  return useQuery({ queryKey: ["cash-registers"], queryFn: getCashRegisters, staleTime: CONFIG_STALE_MS });
}

export function useCreateCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createCashRegister(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-registers"] });
      // Crear una caja crea también sus series (B00n/F00n): sin esta
      // invalidación la pestaña Series seguiría mostrando la lista anterior.
      qc.invalidateQueries({ queryKey: ["invoice-series"] });
    },
  });
}

export function useUpdateCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateCashRegister(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash-registers"] }),
  });
}

export function useDeleteCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCashRegister(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash-registers"] }),
  });
}

// Employees for Fact assignment selector
export function useEmployeesForFactAssignment() {
  return useQuery({ queryKey: ["employees-for-fact"], queryFn: getEmployeesForFactAssignment, staleTime: CONFIG_STALE_MS });
}

// Fact Users
export function useFactUsers() {
  return useQuery({ queryKey: ["fact-users"], queryFn: getFactUsers, staleTime: CONFIG_STALE_MS });
}

export function useCreateFactUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createFactUserAssignment(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fact-users"] }),
  });
}

export function useUpdateFactUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateFactUserAssignment(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fact-users"] }),
  });
}

export function useDeleteFactUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFactUserAssignment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fact-users"] }),
  });
}
