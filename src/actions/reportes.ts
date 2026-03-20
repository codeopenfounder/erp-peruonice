"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthContext } from "@/lib/auth/check-permission"
import type {
  ReportFilters,
  SabanaVentasRow,
  ControlFugasRow,
  RendimientoCatalogoRow,
  ControlCajaRow,
  RendimientoPromosRow,
  InventarioValorizadoRow,
} from "@/types/reportes"

// ---------------------------------------------------------------------------
// Helper: verify user has view permission for at least one of the modules
// ---------------------------------------------------------------------------

async function requireReportAccess(requiredModules: string[]) {
  const { supabase, tenantId, userId, isOwner } = await getAuthContext()

  if (isOwner) return { tenantId }

  const { data: perms } = await supabase
    .from("user_permissions")
    .select("module_code, can_view")
    .eq("user_id", userId)
    .in("module_code", requiredModules)

  const hasAccess = perms?.some((p) => p.can_view) ?? false
  if (!hasAccess) throw new Error("Sin permisos para este reporte")

  return { tenantId }
}

// ---------------------------------------------------------------------------
// Report 1: Sabana General de Ventas y Transacciones
// ---------------------------------------------------------------------------

export async function getReporteSabanaVentas(
  filters: ReportFilters
): Promise<SabanaVentasRow[]> {
  const { tenantId } = await requireReportAccess([
    "ventas.comprobantes",
    "finanzas.movimientos",
  ])

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("fn_report_sabana_ventas", {
    p_tenant_id: tenantId,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
    p_branch_id: filters.branch_id || null,
    p_payment_method: filters.payment_method || null,
  })

  if (error) throw new Error(`Error generando reporte: ${error.message}`)
  return (data ?? []) as SabanaVentasRow[]
}

// ---------------------------------------------------------------------------
// Report 3: Control de Fugas
// ---------------------------------------------------------------------------

export async function getReporteControlFugas(
  filters: ReportFilters
): Promise<ControlFugasRow[]> {
  const { tenantId } = await requireReportAccess([
    "ventas.comprobantes",
    "inventario.movimientos",
    "finanzas.movimientos",
  ])

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("fn_report_control_fugas", {
    p_tenant_id: tenantId,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
    p_branch_id: filters.branch_id || null,
  })

  if (error) throw new Error(`Error generando reporte: ${error.message}`)
  return (data ?? []) as ControlFugasRow[]
}

// ---------------------------------------------------------------------------
// Report 4: Rendimiento de Catalogo y Mix de Ventas
// ---------------------------------------------------------------------------

export async function getReporteRendimientoCatalogo(
  filters: ReportFilters
): Promise<RendimientoCatalogoRow[]> {
  const { tenantId } = await requireReportAccess([
    "inventario.productos",
    "inventario.servicios",
    "ventas.comprobantes",
  ])

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("fn_report_rendimiento_catalogo", {
    p_tenant_id: tenantId,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
    p_branch_id: filters.branch_id || null,
    p_category_id: filters.category_id || null,
  })

  if (error) throw new Error(`Error generando reporte: ${error.message}`)
  return (data ?? []) as RendimientoCatalogoRow[]
}

// ---------------------------------------------------------------------------
// Report 5: Control Financiero y Auditoria de Caja
// ---------------------------------------------------------------------------

export async function getReporteControlCaja(
  filters: ReportFilters
): Promise<ControlCajaRow[]> {
  const { tenantId } = await requireReportAccess([
    "finanzas.caja",
    "finanzas.cierres",
  ])

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("fn_report_control_caja", {
    p_tenant_id: tenantId,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
    p_cash_register_id: filters.cash_register_id || null,
  })

  if (error) throw new Error(`Error generando reporte: ${error.message}`)
  return (data ?? []) as ControlCajaRow[]
}

// ---------------------------------------------------------------------------
// Report 6: Rendimiento de Promociones y Cupones
// ---------------------------------------------------------------------------

export async function getReporteRendimientoPromos(
  filters: ReportFilters
): Promise<RendimientoPromosRow[]> {
  const { tenantId } = await requireReportAccess([
    "inventario.promociones",
    "ventas.comprobantes",
  ])

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("fn_report_rendimiento_promos", {
    p_tenant_id: tenantId,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
  })

  if (error) throw new Error(`Error generando reporte: ${error.message}`)
  return (data ?? []) as RendimientoPromosRow[]
}

// ---------------------------------------------------------------------------
// Report 7: Inventario Valorizado
// ---------------------------------------------------------------------------

export async function getReporteInventarioValorizado(
  filters: ReportFilters
): Promise<InventarioValorizadoRow[]> {
  const { tenantId } = await requireReportAccess([
    "inventario.productos",
    "inventario.insumos",
  ])

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("fn_report_inventario_valorizado", {
    p_tenant_id: tenantId,
    p_branch_id: filters.branch_id || null,
  })

  if (error) throw new Error(`Error generando reporte: ${error.message}`)
  return (data ?? []) as InventarioValorizadoRow[]
}
