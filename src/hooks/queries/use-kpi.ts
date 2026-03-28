"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getKpiSalesSummary,
  getKpiHourlySales,
  getKpiProductRanking,
  getKpiOperationalLeaks,
  getKpiInventoryHealth,
  getKpiDailyTrend,
  getKpiAttendance,
  getKpiHourlyAttendance,
  getKpiExpensesSummary,
  getKpiExpensesTrend,
  getKpiHourlyProductSales,
} from "@/actions/kpi";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import type { DashboardFilters } from "@/types/kpi";

export function useSalesKPIs(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["kpi-sales", filters],
    queryFn: () => getKpiSalesSummary(filters),
    placeholderData: keepPreviousData,
  });
}

export function useHourlySales(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["kpi-hourly", filters],
    queryFn: () => getKpiHourlySales(filters),
    placeholderData: keepPreviousData,
  });
}

export function useProductRanking(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["kpi-products", filters],
    queryFn: () => getKpiProductRanking(filters),
    placeholderData: keepPreviousData,
  });
}

export function useOperationalLeaks(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["kpi-operational", filters],
    queryFn: () => getKpiOperationalLeaks(filters),
    placeholderData: keepPreviousData,
  });
}

export function useInventoryHealth(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["kpi-inventory", filters],
    queryFn: () => getKpiInventoryHealth(filters),
    placeholderData: keepPreviousData,
  });
}

export function useDailyTrend(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["kpi-trend", filters],
    queryFn: () => getKpiDailyTrend(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAttendance(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["kpi-attendance", filters],
    queryFn: () => getKpiAttendance(filters),
    placeholderData: keepPreviousData,
  });
}

export function useHourlyAttendance(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["kpi-hourly-attendance", filters],
    queryFn: () => getKpiHourlyAttendance(filters),
    placeholderData: keepPreviousData,
  });
}

export function useExpensesSummary() {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ["kpi-expenses-summary", filters],
    queryFn: () => getKpiExpensesSummary(filters),
    placeholderData: keepPreviousData,
  });
}

export function useExpensesTrend() {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ["kpi-expenses-trend", filters],
    queryFn: () => getKpiExpensesTrend(filters),
    placeholderData: keepPreviousData,
  });
}

export function useHourlyProductSales(productId: string | null) {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ["kpi-hourly-product-sales", filters, productId],
    queryFn: () => getKpiHourlyProductSales(filters, productId),
    enabled: !!productId,
    placeholderData: keepPreviousData,
  });
}

