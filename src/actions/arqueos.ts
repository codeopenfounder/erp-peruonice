"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/check-permission";
import { revalidatePath } from "next/cache";
import { createSurpriseArqueoSchema } from "@/lib/validators/arqueo";
import type {
  ArqueoKPIs,
  ArqueoListItem,
  ArqueoDetail,
  ArqueoMovementItem,
  ArqueoFilters,
  OpenRegisterSummary,
} from "@/types/arqueo";

const PAGE_SIZE = 50;

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

function peruMonthStartUtc() {
  const peruNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
  );
  const y = peruNow.getFullYear();
  const m = String(peruNow.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01T05:00:00Z`;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
export async function getArqueoKPIs(): Promise<ArqueoKPIs> {
  const { supabase, tenantId } = await getTenantId();
  const monthStart = peruMonthStartUtc();

  const { data: arqueos } = await supabase
    .from("cash_register_arqueos")
    .select("type, difference")
    .eq("tenant_id", tenantId)
    .gte("created_at", monthStart);

  const list = arqueos || [];
  const totalMonth = list.length;
  const totalSorpresas = list.filter((a) => a.type === "sorpresa").length;
  const differences = list.map((a) => Math.abs(Number(a.difference)));
  const avgDiff =
    differences.length > 0
      ? differences.reduce((s, d) => s + d, 0) / differences.length
      : 0;
  const flagged = differences.filter((d) => d > 5).length;

  return {
    total_month: totalMonth,
    total_sorpresas_month: totalSorpresas,
    avg_difference: Math.round(avgDiff * 100) / 100,
    flagged_count: flagged,
  };
}

// ---------------------------------------------------------------------------
// List (paginated)
// ---------------------------------------------------------------------------
export async function getArqueos(
  filters: ArqueoFilters
): Promise<{ data: ArqueoListItem[]; total: number }> {
  const { supabase, tenantId } = await getTenantId();

  let query = supabase
    .from("cash_register_arqueos")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.cash_register_id)
    query = query.eq("cash_register_id", filters.cash_register_id);
  if (filters.date_from) {
    query = query.gte("created_at", `${filters.date_from}T05:00:00Z`);
  }
  if (filters.date_to) {
    const next = new Date(`${filters.date_to}T00:00:00`);
    next.setDate(next.getDate() + 1);
    query = query.lt(
      "created_at",
      `${next.toISOString().split("T")[0]}T05:00:00Z`
    );
  }

  const page = filters.page || 1;
  const from = (page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data: rows, count, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return { data: [], total: count ?? 0 };

  // Batch-fetch register info
  const regIds = [...new Set(rows.map((r) => r.cash_register_id))];
  let regMap: Record<string, { name: string; code: string }> = {};
  if (regIds.length > 0) {
    const { data: regs } = await supabase
      .from("cash_registers")
      .select("id, name, code")
      .in("id", regIds);
    if (regs) {
      regMap = Object.fromEntries(regs.map((r) => [r.id, { name: r.name, code: r.code }]));
    }
  }

  // Batch-fetch branch names
  const branchIds = [...new Set(rows.map((r) => r.branch_id).filter(Boolean))];
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

  const data: ArqueoListItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    cash_register_name: regMap[r.cash_register_id]?.name || "—",
    cash_register_code: regMap[r.cash_register_id]?.code || "",
    branch_name: r.branch_id ? branchMap[r.branch_id] || null : null,
    cashier_name: r.cashier_name,
    supervisor_name: r.supervisor_name,
    expected_amount: Number(r.expected_amount),
    counted_amount: Number(r.counted_amount),
    difference: Number(r.difference),
    created_at: r.created_at,
    period_start: r.period_start,
    period_end: r.period_end,
  }));

  return { data, total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
export async function getArqueoDetail(
  id: string
): Promise<ArqueoDetail | null> {
  const { supabase, tenantId } = await getTenantId();

  const { data: r, error } = await supabase
    .from("cash_register_arqueos")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !r) return null;

  // Fetch register info
  const { data: reg } = await supabase
    .from("cash_registers")
    .select("name, code")
    .eq("id", r.cash_register_id)
    .single();

  // Fetch branch
  let branchName: string | null = null;
  if (r.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", r.branch_id)
      .single();
    branchName = branch?.name || null;
  }

  return {
    id: r.id,
    type: r.type,
    opening_id: r.opening_id,
    cash_register_name: reg?.name || "—",
    cash_register_code: reg?.code || "",
    branch_name: branchName,
    cashier_name: r.cashier_name,
    supervisor_name: r.supervisor_name,
    opening_amount: Number(r.opening_amount),
    total_sales_cash: Number(r.total_sales_cash),
    total_sales_card: Number(r.total_sales_card),
    total_sales_transfer: Number(r.total_sales_transfer),
    total_income: Number(r.total_income),
    total_expense: Number(r.total_expense),
    total_refunds: Number(r.total_refunds),
    total_petty_cash: Number(r.total_petty_cash),
    sale_count: r.sale_count,
    movement_count: r.movement_count,
    expected_amount: Number(r.expected_amount),
    counted_amount: Number(r.counted_amount),
    difference: Number(r.difference),
    denomination_counts: r.denomination_counts || {},
    notes: r.notes,
    created_at: r.created_at,
    period_start: r.period_start,
    period_end: r.period_end,
  };
}

// ---------------------------------------------------------------------------
// Movements for an arqueo (read from cash_register_movements by opening_id)
// ---------------------------------------------------------------------------
export async function getArqueoMovements(
  arqueoId: string
): Promise<ArqueoMovementItem[]> {
  const { supabase, tenantId } = await getTenantId();

  const { data: arqueo } = await supabase
    .from("cash_register_arqueos")
    .select("opening_id, period_end, type")
    .eq("id", arqueoId)
    .eq("tenant_id", tenantId)
    .single();

  if (!arqueo?.opening_id) return [];

  let query = supabase
    .from("cash_register_movements")
    .select("id, type, amount, description, reason, receipt_number, payment_method, created_by, created_at")
    .eq("opening_id", arqueo.opening_id)
    .order("created_at", { ascending: true });

  // For surprise arqueos, only include movements up to the arqueo moment
  if (arqueo.type === "sorpresa" && arqueo.period_end) {
    query = query.lte("created_at", arqueo.period_end);
  }

  const { data: movements } = await query;
  if (!movements || movements.length === 0) return [];

  // Batch-fetch profile names
  const creatorIds = [
    ...new Set(movements.map((m) => m.created_by).filter(Boolean)),
  ];
  let profileMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", creatorIds);
    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, p.full_name])
      );
    }
  }

  return movements.map((m) => ({
    id: m.id,
    type: m.type,
    amount: Number(m.amount),
    description: m.description,
    reason: m.reason,
    receipt_number: m.receipt_number,
    payment_method: m.payment_method,
    created_by_name: m.created_by ? profileMap[m.created_by] || null : null,
    created_at: m.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Open register summary (for surprise arqueo creation)
// ---------------------------------------------------------------------------
export async function getOpenRegisterSummary(
  cashRegisterId: string
): Promise<OpenRegisterSummary | null> {
  const { supabase, tenantId } = await getTenantId();

  // Get current opening
  const { data: reg } = await supabase
    .from("cash_registers")
    .select("current_opening_id")
    .eq("id", cashRegisterId)
    .eq("tenant_id", tenantId)
    .single();

  if (!reg?.current_opening_id) return null;

  const { data: opening } = await supabase
    .from("cash_register_openings")
    .select("id, opened_by, opening_amount, opened_at")
    .eq("id", reg.current_opening_id)
    .single();

  if (!opening) return null;

  // Fetch opener name
  let openerName: string | null = null;
  if (opening.opened_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", opening.opened_by)
      .single();
    openerName = profile?.full_name || null;
  }

  // Aggregate movements for this opening
  const { data: movements } = await supabase
    .from("cash_register_movements")
    .select("type, amount, payment_method")
    .eq("opening_id", opening.id);

  let totalSalesCash = 0;
  let totalSalesCard = 0;
  let totalSalesTransfer = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  let totalRefunds = 0;
  let saleCount = 0;
  let movementCount = 0;

  for (const m of movements || []) {
    const amt = Number(m.amount);
    movementCount++;
    switch (m.type) {
      case "sale":
        saleCount++;
        if (m.payment_method === "card") totalSalesCard += amt;
        else if (m.payment_method === "transfer") totalSalesTransfer += amt;
        else totalSalesCash += amt;
        break;
      case "income":
      case "cash_in":
      case "nd_charge":
        totalIncome += amt;
        break;
      case "expense":
      case "cash_out":
        totalExpense += amt;
        break;
      case "refund":
        totalRefunds += amt;
        break;
    }
  }

  // Monthly petty cash balance
  const peruNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
  );
  const monthStr = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-01T05:00:00Z`;

  const { data: pettyCashMovs } = await supabase
    .from("cash_register_movements")
    .select("amount")
    .eq("cash_register_id", cashRegisterId)
    .eq("type", "petty_cash_in")
    .gte("created_at", monthStr);

  let totalPettyCash = 0;
  for (const m of pettyCashMovs || []) {
    totalPettyCash += Number(m.amount);
  }

  const openingAmt = Number(opening.opening_amount);
  const expected =
    openingAmt + totalSalesCash + totalPettyCash - totalRefunds - totalExpense;

  return {
    opening_id: opening.id,
    opened_by_name: openerName,
    opened_at: opening.opened_at,
    opening_amount: openingAmt,
    total_sales_cash: totalSalesCash,
    total_sales_card: totalSalesCard,
    total_sales_transfer: totalSalesTransfer,
    total_income: totalIncome,
    total_expense: totalExpense,
    total_refunds: totalRefunds,
    total_petty_cash: totalPettyCash,
    sale_count: saleCount,
    movement_count: movementCount,
    expected_amount: expected,
  };
}

// ---------------------------------------------------------------------------
// Create surprise arqueo
// ---------------------------------------------------------------------------
export async function createSurpriseArqueo(input: {
  cash_register_id: string;
  denomination_counts: Record<string, number>;
  counted_amount: number;
  supervisor_id: string;
  supervisor_name: string;
  notes?: string;
}): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  try {
    const parsed = createSurpriseArqueoSchema.parse(input);
    const { supabase, tenantId, userId } =
      await requirePermission("finanzas.arqueos", "create");

    // Get register + opening summary
    const summary = await getOpenRegisterSummary(parsed.cash_register_id);
    if (!summary) {
      return { success: false, error: "La caja no tiene apertura activa" };
    }

    // Get register branch
    const { data: reg } = await supabase
      .from("cash_registers")
      .select("branch_id")
      .eq("id", parsed.cash_register_id)
      .single();

    // Get cashier name (opened_by)
    const cashierName = summary.opened_by_name;

    // Get creator name
    const { data: creatorProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    const now = new Date().toISOString();

    const adminClient = createAdminClient();
    const { data: arqueo, error } = await adminClient
      .from("cash_register_arqueos")
      .insert({
        tenant_id: tenantId,
        cash_register_id: parsed.cash_register_id,
        opening_id: summary.opening_id,
        branch_id: reg?.branch_id || null,
        type: "sorpresa",
        opening_amount: summary.opening_amount,
        total_sales_cash: summary.total_sales_cash,
        total_sales_card: summary.total_sales_card,
        total_sales_transfer: summary.total_sales_transfer,
        total_income: summary.total_income,
        total_expense: summary.total_expense,
        total_refunds: summary.total_refunds,
        total_petty_cash: summary.total_petty_cash,
        sale_count: summary.sale_count,
        movement_count: summary.movement_count,
        expected_amount: summary.expected_amount,
        counted_amount: parsed.counted_amount,
        difference: parsed.counted_amount - summary.expected_amount,
        denomination_counts: parsed.denomination_counts,
        cashier_id: null,
        cashier_name: cashierName,
        supervisor_id: parsed.supervisor_id,
        supervisor_name: parsed.supervisor_name,
        created_by: userId,
        notes: parsed.notes || null,
        period_start: summary.opened_at,
        period_end: now,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath("/finanzas/arqueos");
    return { success: true, data: { id: arqueo.id } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

// ---------------------------------------------------------------------------
// Create cierre arqueo (called internally from heartbeat, no permission check)
// ---------------------------------------------------------------------------
export async function createCierreArqueo(params: {
  tenantId: string;
  cashRegisterId: string;
  openingId: string;
  openedBy: string;
  closedBy: string | null;
  closedByName: string | null;
  openingAmount: number;
  closingAmount: number;
  expectedAmount: number;
  difference: number;
  notes: string | null;
  denominationCounts: Record<string, number>;
}): Promise<void> {
  const adminClient = createAdminClient();

  // Get register info
  const { data: reg } = await adminClient
    .from("cash_registers")
    .select("branch_id")
    .eq("id", params.cashRegisterId)
    .single();

  // Aggregate movements for this opening
  const { data: movements } = await adminClient
    .from("cash_register_movements")
    .select("type, amount, payment_method")
    .eq("opening_id", params.openingId);

  let totalSalesCash = 0;
  let totalSalesCard = 0;
  let totalSalesTransfer = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  let totalRefunds = 0;
  let saleCount = 0;
  let movementCount = 0;

  for (const m of movements || []) {
    const amt = Number(m.amount);
    movementCount++;
    switch (m.type) {
      case "sale":
        saleCount++;
        if (m.payment_method === "card") totalSalesCard += amt;
        else if (m.payment_method === "transfer") totalSalesTransfer += amt;
        else totalSalesCash += amt;
        break;
      case "income":
      case "cash_in":
      case "nd_charge":
        totalIncome += amt;
        break;
      case "expense":
      case "cash_out":
        totalExpense += amt;
        break;
      case "refund":
        totalRefunds += amt;
        break;
    }
  }

  // Petty cash for this month
  const peruNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Lima" })
  );
  const monthStr = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-01T05:00:00Z`;
  const { data: pcMovs } = await adminClient
    .from("cash_register_movements")
    .select("amount")
    .eq("cash_register_id", params.cashRegisterId)
    .eq("type", "petty_cash_in")
    .gte("created_at", monthStr);
  let totalPettyCash = 0;
  for (const m of pcMovs || []) totalPettyCash += Number(m.amount);

  // Get opening details (read opened_by from DB for robustness)
  const { data: opening } = await adminClient
    .from("cash_register_openings")
    .select("opened_at, opened_by")
    .eq("id", params.openingId)
    .single();

  const cashierId = opening?.opened_by || params.openedBy;

  // Get cashier name
  let cashierName: string | null = null;
  if (cashierId) {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", cashierId)
      .single();
    cashierName = profile?.full_name || null;
  }

  // Upsert, no insert: se llama fire-and-forget desde /api/fact/heartbeat y el
  // POS reenvía el heartbeat de cierre ante cualquier fallo de red. Con un
  // insert plano, cada reenvío creaba OTRO arqueo de cierre para la misma
  // apertura.
  //
  // El conflicto se resuelve sobre `cierre_opening_id`, una columna generada que
  // vale `opening_id` sólo en los arqueos de cierre y NULL en los de sorpresa
  // (migración 00037). Un índice parcial no serviría: PostgREST no sabe emitir
  // el predicado que Postgres exige para inferirlo, y los arqueos sorpresa sí
  // pueden repetirse dentro de una misma apertura.
  const upsertResult = await adminClient
    .from("cash_register_arqueos")
    .upsert(
      {
        tenant_id: params.tenantId,
        cash_register_id: params.cashRegisterId,
        opening_id: params.openingId,
        branch_id: reg?.branch_id || null,
        type: "cierre",
        opening_amount: params.openingAmount,
        total_sales_cash: totalSalesCash,
        total_sales_card: totalSalesCard,
        total_sales_transfer: totalSalesTransfer,
        total_income: totalIncome,
        total_expense: totalExpense,
        total_refunds: totalRefunds,
        total_petty_cash: totalPettyCash,
        sale_count: saleCount,
        movement_count: movementCount,
        expected_amount: params.expectedAmount,
        counted_amount: params.closingAmount,
        difference: params.difference,
        denomination_counts: params.denominationCounts || {},
        cashier_id: cashierId,
        cashier_name: cashierName,
        supervisor_id: params.closedBy,
        supervisor_name: params.closedByName,
        created_by: params.closedBy || cashierId,
        notes: params.notes,
        period_start: opening?.opened_at || null,
        period_end: new Date().toISOString(),
      },
      { onConflict: "cierre_opening_id" },
    );

  if (upsertResult.error) {
    console.error("[createCierreArqueo] Upsert failed:", upsertResult.error.message);
  }
}
