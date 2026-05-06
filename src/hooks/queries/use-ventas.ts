"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  getInvoices,
  getInvoiceKPIs,
  getInvoiceDetail,
  getCustomers,
  getCustomerKPIs,
  deleteCustomer,
} from "@/actions/ventas";
import type { InvoiceFilters, CustomerFilters } from "@/types/invoice";

const TRANSACTIONAL_STALE_MS = 30 * 1000;
const CATALOG_STALE_MS = 10 * 60 * 1000;

export function useInvoices(filters: InvoiceFilters) {
  return useQuery({
    queryKey: ["invoices", filters],
    queryFn: () => getInvoices(filters),
    placeholderData: keepPreviousData,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useInvoiceKPIs(date?: string) {
  return useQuery({
    queryKey: ["invoice-kpis", date],
    queryFn: () => getInvoiceKPIs(date),
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useInvoiceDetail(id: string) {
  return useQuery({
    queryKey: ["invoice-detail", id],
    queryFn: () => getInvoiceDetail(id),
    enabled: !!id,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: ["customers", filters],
    queryFn: () => getCustomers(filters),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_MS,
  });
}

export function useCustomerKPIs() {
  return useQuery({
    queryKey: ["customer-kpis"],
    queryFn: () => getCustomerKPIs(),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: (res) => {
      if (res.success) {
        qc.invalidateQueries({ queryKey: ["customers"] });
        qc.invalidateQueries({ queryKey: ["customer-kpis"] });
      }
    },
  });
}
