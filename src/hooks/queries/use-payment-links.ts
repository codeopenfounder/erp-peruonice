"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPaymentLinkKPIs,
  getPaymentLinks,
  getPaymentLinkDetail,
  cancelPaymentLink,
} from "@/actions/payment-links";
import type { PaymentLinkFilters } from "@/types/payment-link";

export function usePaymentLinkKPIs() {
  return useQuery({
    queryKey: ["payment-link-kpis"],
    queryFn: () => getPaymentLinkKPIs(),
  });
}

export function usePaymentLinks(filters: PaymentLinkFilters) {
  return useQuery({
    queryKey: ["payment-links", filters],
    queryFn: () => getPaymentLinks(filters),
    placeholderData: (prev) => prev,
  });
}

export function usePaymentLinkDetail(id: string) {
  return useQuery({
    queryKey: ["payment-link-detail", id],
    queryFn: () => getPaymentLinkDetail(id),
    enabled: !!id,
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
