"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getArqueoKPIs,
  getArqueos,
  getArqueoDetail,
  getArqueoMovements,
  getOpenRegisterSummary,
  createSurpriseArqueo,
} from "@/actions/arqueos";
import type { ArqueoFilters } from "@/types/arqueo";

export function useArqueoKPIs() {
  return useQuery({
    queryKey: ["arqueo-kpis"],
    queryFn: () => getArqueoKPIs(),
  });
}

export function useArqueos(filters: ArqueoFilters) {
  return useQuery({
    queryKey: ["arqueos", filters],
    queryFn: () => getArqueos(filters),
    placeholderData: (prev) => prev,
  });
}

export function useArqueoDetail(id: string) {
  return useQuery({
    queryKey: ["arqueo-detail", id],
    queryFn: () => getArqueoDetail(id),
    enabled: !!id,
  });
}

export function useArqueoMovements(arqueoId: string) {
  return useQuery({
    queryKey: ["arqueo-movements", arqueoId],
    queryFn: () => getArqueoMovements(arqueoId),
    enabled: !!arqueoId,
  });
}

export function useOpenRegisterSummary(cashRegisterId: string | null) {
  return useQuery({
    queryKey: ["open-register-summary", cashRegisterId],
    queryFn: () => getOpenRegisterSummary(cashRegisterId!),
    enabled: !!cashRegisterId,
  });
}

export function useCreateSurpriseArqueo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSurpriseArqueo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arqueos"] });
      queryClient.invalidateQueries({ queryKey: ["arqueo-kpis"] });
    },
  });
}
