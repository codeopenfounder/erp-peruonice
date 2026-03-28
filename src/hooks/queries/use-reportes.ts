"use client"

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  getReporteSabanaVentas,
  getReporteControlFugas,
  getReporteRendimientoCatalogo,
  getReporteControlCaja,
  getReporteRendimientoPromos,
  getReporteInventarioValorizado,
  getReporteTraficoVsEntradas,
  getReporteKardexInventario,
  getReporteInventarioValorizadoV2,
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

export function useReporteTraficoVsEntradas(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-trafico-vs-entradas", filters],
    queryFn: () => getReporteTraficoVsEntradas(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useReporteKardexInventario(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-kardex-inventario", filters],
    queryFn: () => getReporteKardexInventario(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useReporteInventarioValorizadoV2(filters: ReportFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["reporte-inventario-valorizado-v2", filters],
    queryFn: () => getReporteInventarioValorizadoV2(filters),
    enabled,
    placeholderData: keepPreviousData,
  })
}
