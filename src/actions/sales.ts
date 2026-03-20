"use server";

import { createClient } from "@/lib/supabase/server";
import type { SalesKPIs, SalesFilters, SaleListItem } from "@/types/sale";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Sales KPIs
// ---------------------------------------------------------------------------
export async function getSalesKPIs(date?: string): Promise<SalesKPIs> {
  const { supabase, tenantId } = await getTenantId();

  // Peru timezone date (UTC-5)
  const targetDate =
    date ||
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const dayStartUtc = `${targetDate}T05:00:00Z`;
  const nextDay = new Date(`${targetDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const dayEndUtc = `${nextDay.toISOString().split("T")[0]}T05:00:00Z`;

  // Fetch only facturas and boletas, not voided
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, total, payment_method, created_at")
    .eq("tenant_id", tenantId)
    .in("document_type", ["factura", "boleta"])
    .neq("status", "voided")
    .gte("created_at", dayStartUtc)
    .lt("created_at", dayEndUtc);

  const rows = invoices || [];

  // Batch-fetch item counts for all invoices
  let itemsSold = 0;
  if (rows.length > 0) {
    const invoiceIds = rows.map((inv) => inv.id);
    const { data: items } = await supabase
      .from("invoice_items")
      .select("invoice_id, quantity")
      .in("invoice_id", invoiceIds);
    if (items) {
      itemsSold = items.reduce((sum, it) => sum + Number(it.quantity), 0);
    }
  }

  let totalSales = 0;
  let transactionCount = 0;
  const byPayment: Record<string, { count: number; total: number }> = {};
  const hourMap: Record<number, { count: number; total: number }> = {};

  rows.forEach((inv) => {
    const amt = Number(inv.total);
    totalSales += amt;
    transactionCount += 1;

    // by_payment
    const pm = inv.payment_method || "otros";
    if (!byPayment[pm]) byPayment[pm] = { count: 0, total: 0 };
    byPayment[pm].count += 1;
    byPayment[pm].total += amt;

    // by_hour — convert UTC created_at to Peru hour (UTC-5)
    const utcDate = new Date(inv.created_at);
    const peruHour = (utcDate.getUTCHours() - 5 + 24) % 24;
    if (!hourMap[peruHour]) hourMap[peruHour] = { count: 0, total: 0 };
    hourMap[peruHour].count += 1;
    hourMap[peruHour].total += amt;
  });

  const byHour = Object.entries(hourMap)
    .map(([h, v]) => ({ hour: Number(h), count: v.count, total: v.total }))
    .sort((a, b) => a.hour - b.hour);

  return {
    total_sales: totalSales,
    transaction_count: transactionCount,
    average_ticket: transactionCount > 0 ? totalSales / transactionCount : 0,
    items_sold: itemsSold,
    by_payment: byPayment,
    by_hour: byHour,
  };
}

// ---------------------------------------------------------------------------
// Sales (paginated)
// ---------------------------------------------------------------------------
export async function getSales(
  filters: SalesFilters
): Promise<{ data: SaleListItem[]; total: number }> {
  const { supabase, tenantId } = await getTenantId();

  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Default date = today in Peru TZ
  const targetDate =
    filters.date ||
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const dayStartUtc = `${targetDate}T05:00:00Z`;
  const nextDay = new Date(`${targetDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const dayEndUtc = `${nextDay.toISOString().split("T")[0]}T05:00:00Z`;

  let query = supabase
    .from("invoices")
    .select(
      "id, document_type, correlative_number, series_id, issue_date, customer_name, customer_document_number, op_gravada, op_exonerada, op_inafecta, igv_total, discount_total, promotion_discount, total, status, payment_method, cash_register_id, cashier_id, created_at",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .neq("status", "voided")
    .gte("created_at", dayStartUtc)
    .lt("created_at", dayEndUtc)
    .order("created_at", { ascending: false })
    .range(from, to);

  // Apply filters
  if (filters.payment_method) {
    query = query.eq("payment_method", filters.payment_method);
  }
  if (filters.cash_register_id) {
    query = query.eq("cash_register_id", filters.cash_register_id);
  }

  // Search by customer name or document number
  if (filters.search) {
    const s = filters.search.trim();
    query = query.or(
      `customer_name.ilike.%${s}%,customer_document_number.ilike.%${s}%`
    );
  }

  const { data: invoices, error, count } = await query;
  if (error) throw new Error(error.message);
  if (!invoices || invoices.length === 0) return { data: [], total: 0 };

  // Batch-fetch series codes
  const seriesIds = [
    ...new Set(invoices.map((inv) => inv.series_id).filter(Boolean)),
  ];
  let seriesMap: Record<string, string> = {};
  if (seriesIds.length > 0) {
    const { data: series } = await supabase
      .from("invoice_series")
      .select("id, series_code")
      .in("id", seriesIds);
    if (series) {
      seriesMap = Object.fromEntries(
        series.map((s) => [s.id, s.series_code])
      );
    }
  }

  // Batch-fetch cash register names + branch_id
  const cashRegisterIds = [
    ...new Set(invoices.map((inv) => inv.cash_register_id).filter(Boolean)),
  ] as string[];
  let registerMap: Record<
    string,
    { name: string; branch_id: string | null }
  > = {};
  if (cashRegisterIds.length > 0) {
    const { data: registers } = await supabase
      .from("cash_registers")
      .select("id, name, branch_id")
      .in("id", cashRegisterIds);
    if (registers) {
      registerMap = Object.fromEntries(
        registers.map((r) => [r.id, { name: r.name, branch_id: r.branch_id }])
      );
    }
  }

  // Batch-fetch branch names
  const branchIds = [
    ...new Set(
      Object.values(registerMap)
        .map((r) => r.branch_id)
        .filter(Boolean)
    ),
  ] as string[];
  let branchMap: Record<string, string> = {};
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);
    if (branches) {
      branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
    }
  }

  // Batch-fetch cashier names
  const cashierIds = [
    ...new Set(invoices.map((inv) => inv.cashier_id).filter(Boolean)),
  ] as string[];
  let cashierMap: Record<string, string> = {};
  if (cashierIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", cashierIds);
    if (profiles) {
      cashierMap = Object.fromEntries(
        profiles.map((p) => [p.id, p.full_name ?? ""])
      );
    }
  }

  // Batch-fetch item counts per invoice
  const invoiceIds = invoices.map((inv) => inv.id);
  const itemCountMap: Record<string, number> = {};
  if (invoiceIds.length > 0) {
    const { data: items } = await supabase
      .from("invoice_items")
      .select("invoice_id")
      .in("invoice_id", invoiceIds);
    if (items) {
      items.forEach((it) => {
        itemCountMap[it.invoice_id] = (itemCountMap[it.invoice_id] ?? 0) + 1;
      });
    }
  }

  const data: SaleListItem[] = invoices.map((inv) => {
    const reg = inv.cash_register_id
      ? registerMap[inv.cash_register_id]
      : null;
    return {
      id: inv.id,
      created_at: inv.created_at,
      issue_date: inv.issue_date,
      document_type: inv.document_type,
      series_code: inv.series_id ? seriesMap[inv.series_id] ?? "" : "",
      correlative_number: inv.correlative_number,
      customer_name: inv.customer_name,
      customer_document_number: inv.customer_document_number,
      items_count: itemCountMap[inv.id] ?? 0,
      op_gravada: Number(inv.op_gravada),
      op_exonerada: Number(inv.op_exonerada),
      op_inafecta: Number(inv.op_inafecta),
      igv_total: Number(inv.igv_total),
      discount_total: Number(inv.discount_total),
      promotion_discount: Number(inv.promotion_discount),
      total: Number(inv.total),
      payment_method: inv.payment_method,
      cashier_name: inv.cashier_id ? cashierMap[inv.cashier_id] ?? null : null,
      cash_register_name: reg?.name ?? null,
      branch_name: reg?.branch_id ? branchMap[reg.branch_id] ?? null : null,
      status: inv.status,
    };
  });

  return { data, total: count ?? 0 };
}
