"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPaymentLinkKPIs,
  getPaymentLinks,
  getPaymentLinkDetail,
  cancelPaymentLink,
} from "@/actions/payment-links";
import type { PaymentLinkFilters } from "@/types/payment-link";

const TRANSACTIONAL_STALE_MS = 30 * 1000;

export function usePaymentLinkKPIs() {
  return useQuery({
    queryKey: ["payment-link-kpis"],
    queryFn: () => getPaymentLinkKPIs(),
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function usePaymentLinks(filters: PaymentLinkFilters) {
  return useQuery({
    queryKey: ["payment-links", filters],
    queryFn: () => getPaymentLinks(filters),
    placeholderData: (prev) => prev,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function usePaymentLinkDetail(id: string) {
  return useQuery({
    queryKey: ["payment-link-detail", id],
    queryFn: () => getPaymentLinkDetail(id),
    enabled: !!id,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useCancelPaymentLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelPaymentLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-links"] });
      queryClient.invalidateQueries({ queryKey: ["payment-link-kpis"] });
    },
  });
}
