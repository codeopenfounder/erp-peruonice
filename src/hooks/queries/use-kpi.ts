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
} from "@/actions/kpi";
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
