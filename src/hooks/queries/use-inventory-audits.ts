"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getAudits,
  getAuditById,
  getAuditKPIs,
  getAuditableItems,
  createAudit,
} from "@/actions/inventory-audits";
import type { AuditFilters } from "@/types/inventory-audit";

export function useAuditKPIs() {
  return useQuery({
    queryKey: ["audit-kpis"],
    queryFn: () => getAuditKPIs(),
  });
}

export function useAudits(filters: AuditFilters) {
  return useQuery({
    queryKey: ["audits", filters],
    queryFn: () => getAudits(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAudit(id: string) {
  return useQuery({
    queryKey: ["audit", id],
    queryFn: () => getAuditById(id),
    enabled: !!id,
  });
}

export function useAuditableItems(branchId: string, categoryId?: string, atRiskOnly?: boolean) {
  return useQuery({
    queryKey: ["auditable-items", branchId, categoryId, atRiskOnly],
    queryFn: () => getAuditableItems(branchId, categoryId, atRiskOnly),
    enabled: !!branchId,
    staleTime: 60_000,
  });
}

export function useCreateAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => createAudit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audits"] });
      queryClient.invalidateQueries({ queryKey: ["audit-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      queryClient.invalidateQueries({ queryKey: ["movement-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
    },
  });
}
