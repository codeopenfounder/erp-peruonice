"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  DashboardFilters,
  SalesSummary,
  HourlySalesPoint,
  ProductRankingResult,
  OperationalLeaks,
  InventoryHealth,
  DailyTrendPoint,
  AttendanceSummary,
  HourlyAttendancePoint,
} from "@/types/kpi";

async function getTenantId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) throw new Error("Sin tenant asignado");

  return { supabase, tenantId: profile.tenant_id, userId: user.id };
}

function peruToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function getPreviousPeriod(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  const diff = t.getTime() - f.getTime();
  const prevTo = new Date(f.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diff);
  return {
    prev_from: prevFrom.toLocaleDateString("en-CA"),
    prev_to: prevTo.toLocaleDateString("en-CA"),
  };
}

// ---------------------------------------------------------------------------
// Module 1: Sales Summary (with previous period comparison)
// ---------------------------------------------------------------------------
export async function getKpiSalesSummary(
  filters: DashboardFilters
): Promise<SalesSummary> {
  const { supabase, tenantId } = await getTenantId();
  const { date_from, date_to, branch_id } = filters;

  const [current, previous] = await Promise.all([
    supabase.rpc("fn_kpi_sales_summary", {
      p_tenant_id: tenantId,
      p_branch_id: branch_id || null,
      p_date_from: date_from,
      p_date_to: date_to,
    }),
    (() => {
      const { prev_from, prev_to } = getPreviousPeriod(date_from, date_to);
      return supabase.rpc("fn_kpi_sales_summary", {
        p_tenant_id: tenantId,
        p_branch_id: branch_id || null,
        p_date_from: prev_from,
        p_date_to: prev_to,
      });
    })(),
  ]);

  const c = current.data?.[0] ?? {};
  const p = previous.data?.[0] ?? {};

  return {
    total_revenue: Number(c.total_revenue ?? 0),
    transaction_count: Number(c.transaction_count ?? 0),
    avg_ticket: Number(c.avg_ticket ?? 0),
    prev_total_revenue: Number(p.total_revenue ?? 0),
    prev_transaction_count: Number(p.transaction_count ?? 0),
    prev_avg_ticket: Number(p.avg_ticket ?? 0),
    revenue_cash: Number(c.revenue_cash ?? 0),
    revenue_card: Number(c.revenue_card ?? 0),
    revenue_transfer: Number(c.revenue_transfer ?? 0),
    revenue_credit: Number(c.revenue_credit ?? 0),
    revenue_mixed: Number(c.revenue_mixed ?? 0),
    facturas_count: Number(c.facturas_count ?? 0),
    boletas_count: Number(c.boletas_count ?? 0),
    tickets_count: Number(c.tickets_count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Module 1: Hourly Sales
// ---------------------------------------------------------------------------
export async function getKpiHourlySales(
  filters: DashboardFilters
): Promise<HourlySalesPoint[]> {
  const { supabase, tenantId } = await getTenantId();

  const { data } = await supabase.rpc("fn_kpi_hourly_sales", {
    p_tenant_id: tenantId,
    p_branch_id: filters.branch_id || null,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
  });

  return (data || []).map((row: Record<string, unknown>) => ({
    hour_of_day: Number(row.hour_of_day),
    revenue: Number(row.revenue),
    tx_count: Number(row.tx_count),
  }));
}

// ---------------------------------------------------------------------------
// Module 2: Product Ranking (top + flop)
// ---------------------------------------------------------------------------
export async function getKpiProductRanking(
  filters: DashboardFilters
): Promise<ProductRankingResult> {
  const { supabase, tenantId } = await getTenantId();
  const { date_from, date_to, branch_id } = filters;

  const [topResult, flopResult] = await Promise.all([
    supabase.rpc("fn_kpi_product_ranking", {
      p_tenant_id: tenantId,
      p_branch_id: branch_id || null,
      p_date_from: date_from,
      p_date_to: date_to,
      p_limit: 10,
      p_order: "desc",
    }),
    supabase.rpc("fn_kpi_product_ranking", {
      p_tenant_id: tenantId,
      p_branch_id: branch_id || null,
      p_date_from: date_from,
      p_date_to: date_to,
      p_limit: 10,
      p_order: "asc",
    }),
  ]);

  const mapRow = (row: Record<string, unknown>) => ({
    product_id: String(row.product_id ?? ""),
    product_name: String(row.product_name ?? ""),
    product_sku: String(row.product_sku ?? ""),
    units_sold: Number(row.units_sold ?? 0),
    total_revenue: Number(row.total_revenue ?? 0),
    pct_of_total: Number(row.pct_of_total ?? 0),
    avg_unit_price: Number(row.avg_unit_price ?? 0),
  });

  return {
    top: (topResult.data || []).map(mapRow),
    flop: (flopResult.data || []).filter((r: Record<string, unknown>) => Number(r.total_revenue ?? 0) > 0).map(mapRow),
  };
}

// ---------------------------------------------------------------------------
// Module 3: Operational Leaks
// ---------------------------------------------------------------------------
export async function getKpiOperationalLeaks(
  filters: DashboardFilters
): Promise<OperationalLeaks> {
  const { supabase, tenantId } = await getTenantId();

  const { data } = await supabase.rpc("fn_kpi_operational_leaks", {
    p_tenant_id: tenantId,
    p_branch_id: filters.branch_id || null,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
  });

  const row = data?.[0] ?? {};
  return {
    voided_count: Number(row.voided_count ?? 0),
    voided_amount: Number(row.voided_amount ?? 0),
    voided_pct_tx: Number(row.voided_pct_tx ?? 0),
    voided_pct_revenue: Number(row.voided_pct_revenue ?? 0),
    cortesia_count: Number(row.cortesia_count ?? 0),
    cortesia_amount: Number(row.cortesia_amount ?? 0),
    cortesia_pct_tx: Number(row.cortesia_pct_tx ?? 0),
    cortesia_pct_revenue: Number(row.cortesia_pct_revenue ?? 0),
    promo_tx_count: Number(row.promo_tx_count ?? 0),
    promo_discount_total: Number(row.promo_discount_total ?? 0),
    promo_pct_tx: Number(row.promo_pct_tx ?? 0),
    promo_pct_revenue: Number(row.promo_pct_revenue ?? 0),
    total_tx: Number(row.total_tx ?? 0),
    total_revenue: Number(row.total_revenue ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Module 4: Inventory Health
// ---------------------------------------------------------------------------
export async function getKpiInventoryHealth(
  filters: DashboardFilters
): Promise<InventoryHealth> {
  const { supabase, tenantId } = await getTenantId();

  const { data } = await supabase.rpc("fn_kpi_inventory_health", {
    p_tenant_id: tenantId,
    p_branch_id: filters.branch_id || null,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
  });

  const row = data?.[0] ?? {};
  return {
    total_audits: Number(row.total_audits ?? 0),
    items_audited: Number(row.items_audited ?? 0),
    items_with_discrepancy: Number(row.items_with_discrepancy ?? 0),
    total_discrepancy_value: Number(row.total_discrepancy_value ?? 0),
    efficiency_pct: Number(row.efficiency_pct ?? 100),
    waste_movements: Number(row.waste_movements ?? 0),
    waste_value: Number(row.waste_value ?? 0),
    shrinkage_movements: Number(row.shrinkage_movements ?? 0),
    shrinkage_value: Number(row.shrinkage_value ?? 0),
    breakage_movements: Number(row.breakage_movements ?? 0),
    breakage_value: Number(row.breakage_value ?? 0),
    staff_consumption_movements: Number(row.staff_consumption_movements ?? 0),
    staff_consumption_value: Number(row.staff_consumption_value ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Daily Trend (from snapshots for historical, real-time for today)
// ---------------------------------------------------------------------------
export async function getKpiDailyTrend(
  filters: DashboardFilters
): Promise<DailyTrendPoint[]> {
  const { supabase, tenantId } = await getTenantId();
  const today = peruToday();

  const { data: snapshots } = await supabase
    .from("kpi_daily_snapshots")
    .select(
      "snapshot_date, total_revenue, transaction_count, avg_ticket, voided_amount, cortesia_amount, promotion_discount_total"
    )
    .eq("tenant_id", tenantId)
    .is("branch_id", filters.branch_id || null)
    .gte("snapshot_date", filters.date_from)
    .lte("snapshot_date", filters.date_to)
    .order("snapshot_date", { ascending: true });

  const points: DailyTrendPoint[] = (snapshots || []).map(
    (s: Record<string, unknown>) => ({
      date: String(s.snapshot_date),
      total_revenue: Number(s.total_revenue ?? 0),
      transaction_count: Number(s.transaction_count ?? 0),
      avg_ticket: Number(s.avg_ticket ?? 0),
      voided_amount: Number(s.voided_amount ?? 0),
      cortesia_amount: Number(s.cortesia_amount ?? 0),
      promotion_discount_total: Number(s.promotion_discount_total ?? 0),
    })
  );

  // If today is in range, add real-time data
  if (filters.date_from <= today && filters.date_to >= today) {
    const todayExists = points.some((p) => p.date === today);
    if (!todayExists) {
      const { data: todayData } = await supabase.rpc("fn_kpi_sales_summary", {
        p_tenant_id: tenantId,
        p_branch_id: filters.branch_id || null,
        p_date_from: today,
        p_date_to: today,
      });
      const t = todayData?.[0];
      if (t) {
        points.push({
          date: today,
          total_revenue: Number(t.total_revenue ?? 0),
          transaction_count: Number(t.transaction_count ?? 0),
          avg_ticket: Number(t.avg_ticket ?? 0),
          voided_amount: 0,
          cortesia_amount: 0,
          promotion_discount_total: 0,
        });
      }
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Attendance: QR-based entry tracking from poi-lector
// ---------------------------------------------------------------------------
export async function getKpiAttendance(
  filters: DashboardFilters
): Promise<AttendanceSummary> {
  const { supabase, tenantId } = await getTenantId();

  const { data } = await supabase.rpc("fn_kpi_attendance", {
    p_tenant_id: tenantId,
    p_branch_id: filters.branch_id || null,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
  });

  const row = data?.[0] ?? {};
  return {
    total_entries: Number(row.total_entries ?? 0),
    total_scans: Number(row.total_scans ?? 0),
    unique_reservations: Number(row.unique_reservations ?? 0),
    active_sessions: Number(row.active_sessions ?? 0),
    avg_dwell_minutes: Number(row.avg_dwell_minutes ?? 0),
    prev_total_entries: Number(row.prev_total_entries ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Hourly Attendance: Entries per hour with occupancy %
// ---------------------------------------------------------------------------
export async function getKpiHourlyAttendance(
  filters: DashboardFilters
): Promise<HourlyAttendancePoint[]> {
  const { supabase, tenantId } = await getTenantId();

  const { data } = await supabase.rpc("fn_kpi_hourly_attendance", {
    p_tenant_id: tenantId,
    p_branch_id: filters.branch_id || null,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
  });

  return (data || []).map((row: Record<string, unknown>) => ({
    hour_of_day: Number(row.hour_of_day),
    entries: Number(row.entries),
    scan_count: Number(row.scan_count),
    occupancy_pct: Number(row.occupancy_pct),
  }));
}
