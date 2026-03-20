"use client"

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  getReporteSabanaVentas,
  getReporteControlFugas,
  getReporteRendimientoCatalogo,
  getReporteControlCaja,
  getReporteRendimientoPromos,
  getReporteInventarioValorizado,
} from "@/actions/reportes"
import type { ReportFilters } from "@/types/reportes"

export function useReporteSabanaVentas(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-sabana-ventas", filters],
    queryFn: () => getReporteSabanaVentas(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useReporteControlFugas(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-control-fugas", filters],
    queryFn: () => getReporteControlFugas(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useReporteRendimientoCatalogo(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-rendimiento-catalogo", filters],
    queryFn: () => getReporteRendimientoCatalogo(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useReporteControlCaja(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-control-caja", filters],
    queryFn: () => getReporteControlCaja(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useReporteRendimientoPromos(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-rendimiento-promos", filters],
    queryFn: () => getReporteRendimientoPromos(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useReporteInventarioValorizado(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-inventario-valorizado", filters],
    queryFn: () => getReporteInventarioValorizado(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}
