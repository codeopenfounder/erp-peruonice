"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pettyCashSchema, adjustExpenseFundSchema } from "@/lib/validators/gastos";
import { notifyModuleAction } from "./notifications";
import type {
  GastosKPIs,
  CashRegisterStatusItem,
  GastosMovementListItem,
  GastosFilters,
  DailyReportData,
  ClosingHistoryItem,
  ClosingHistoryFilters,
  ExpenseFundStatusItem,
  ExpenseFundMovementItem,
  ExpenseFundFilters,
} from "@/types/gastos";

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
// KPIs
// ---------------------------------------------------------------------------
export async function getGastosKPIs(date?: string): Promise<GastosKPIs> {
  const { supabase, tenantId } = await getTenantId();

  // Peru timezone date (UTC-5)
  const targetDate = date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const dayStartUtc = `${targetDate}T05:00:00Z`;
  const nextDay = new Date(`${targetDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const dayEndUtc = `${nextDay.toISOString().split("T")[0]}T05:00:00Z`;

  // Query movements directly by date range (works for both poi-erp openings and poi-fact synced movements)
  const { data: movements } = await supabase
    .from("cash_register_movements")
    .select("type, amount, payment_method")
    .eq("tenant_id", tenantId)
    .gte("created_at", dayStartUtc)
    .lt("created_at", dayEndUtc);

  let totalSales = 0;
  let totalCashIn = 0;
  let totalCashOut = 0;

  (movements || []).forEach((m) => {
    const amt = Number(m.amount);
    switch (m.type) {
      case "sale":
        // Solo ventas en efectivo afectan la caja fisica
        if (!m.payment_method || m.payment_method === "cash") totalSales += amt;
        break;
      case "cash_in":
      case "income":
        totalCashIn += amt;
        break;
      case "cash_out":
      case "expense":
        totalCashOut += amt;
        break;
    }
  });

  // Count registers
  const [openRegs, totalRegs] = await Promise.all([
    supabase
      .from("cash_registers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .not("current_opening_id", "is", null),
    supabase
      .from("cash_registers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
  ]);

  return {
    total_sales_today: totalSales,
    total_cash_in_today: totalCashIn,
    total_cash_out_today: totalCashOut,
    open_registers: openRegs.count ?? 0,
    total_registers: totalRegs.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Cash Register Statuses
// ---------------------------------------------------------------------------
export async function getCashRegisterStatuses(): Promise<CashRegisterStatusItem[]> {
  const { supabase, tenantId } = await getTenantId();

  const { data: registers, error } = await supabase
    .from("cash_registers")
    .select("id, name, code, branch_id, is_active, current_opening_id, petty_cash_amount")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error(error.message);
  if (!registers || registers.length === 0) return [];

  // Batch-fetch branch names
  const branchIds = [...new Set(registers.map((r) => r.branch_id).filter(Boolean))];
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

  // Batch-fetch current openings
  const openingIds = registers.map((r) => r.current_opening_id).filter(Boolean) as string[];
  let openingMap: Record<string, { opened_at: string; opened_by: string; opening_amount: number }> = {};
  if (openingIds.length > 0) {
    const { data: openings } = await supabase
      .from("cash_register_openings")
      .select("id, opened_at, opened_by, opening_amount")
      .in("id", openingIds);
    if (openings) {
      openingMap = Object.fromEntries(
        openings.map((o) => [o.id, { opened_at: o.opened_at, opened_by: o.opened_by, opening_amount: o.opening_amount }])
      );
    }
  }

  // Batch-fetch profile names for openers
  const openerIds = [...new Set(Object.values(openingMap).map((o) => o.opened_by).filter(Boolean))];
  let profileMap: Record<string, string> = {};
  if (openerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", openerIds);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
    }
  }

  // Calculate monthly petty cash assigned (petty_cash_in this month per register)
  const regIds = registers.map((r) => r.id);
  const peruNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const monthStart = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-01T05:00:00Z`;

  let monthlyAssignedMap: Record<string, number> = {};
  if (regIds.length > 0) {
    const { data: pettyCashMovs } = await supabase
      .from("cash_register_movements")
      .select("cash_register_id, amount")
      .eq("tenant_id", tenantId)
      .in("cash_register_id", regIds)
      .eq("type", "petty_cash_in")
      .gte("created_at", monthStart);

    for (const m of pettyCashMovs || []) {
      if (!m.cash_register_id) continue;
      monthlyAssignedMap[m.cash_register_id] = (monthlyAssignedMap[m.cash_register_id] || 0) + m.amount;
    }
  }

  // Batch-fetch monthly income/expense for ALL openings this month (cross-opening)
  let balanceMap: Record<string, { income: number; expense: number }> = {};
  if (regIds.length > 0) {
    // Get all openings this month for these registers
    const { data: monthOpenings } = await supabase
      .from("cash_register_openings")
      .select("id, cash_register_id")
      .in("cash_register_id", regIds)
      .gte("opened_at", monthStart);

    if (monthOpenings && monthOpenings.length > 0) {
      const monthOpeningIds = monthOpenings.map((o) => o.id);
      // Map opening_id → cash_register_id for grouping
      const openingToReg: Record<string, string> = {};
      for (const o of monthOpenings) {
        openingToReg[o.id] = o.cash_register_id;
      }

      const { data: movTotals } = await supabase
        .from("cash_register_movements")
        .select("opening_id, type, amount")
        .in("opening_id", monthOpeningIds)
        .in("type", ["income", "expense"]);

      for (const m of movTotals || []) {
        if (!m.opening_id) continue;
        const crId = openingToReg[m.opening_id];
        if (!crId) continue;
        if (!balanceMap[crId]) balanceMap[crId] = { income: 0, expense: 0 };
        if (m.type === "income") {
          balanceMap[crId].income += m.amount;
        } else {
          balanceMap[crId].expense += m.amount;
        }
      }
    }
  }

  // Get accumulated cash (last closing_amount for each register)
  const { data: lastClosings } = await supabase
    .from("cash_register_openings")
    .select("cash_register_id, closing_amount")
    .eq("status", "closed")
    .in("cash_register_id", regIds)
    .order("closed_at", { ascending: false });

  // Build map: register_id → last closing_amount
  const accumulatedMap: Record<string, number> = {};
  lastClosings?.forEach((c) => {
    if (!accumulatedMap[c.cash_register_id]) {
      accumulatedMap[c.cash_register_id] = Number(c.closing_amount) || 0;
    }
  });

  return registers.map((r) => {
    const opening = r.current_opening_id ? openingMap[r.current_opening_id] : null;
    const monthlyAssigned = monthlyAssignedMap[r.id] || 0;
    const bal = balanceMap[r.id];
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      branch_name: r.branch_id ? branchMap[r.branch_id] ?? null : null,
      is_open: !!r.current_opening_id,
      opened_at: opening?.opened_at ?? null,
      opened_by_name: opening ? profileMap[opening.opened_by] ?? null : null,
      opening_amount: opening?.opening_amount ?? 0,
      petty_cash_amount: monthlyAssigned,
      petty_cash_balance: bal
        ? monthlyAssigned + bal.income - bal.expense
        : monthlyAssigned,
      accumulated_cash: accumulatedMap[r.id] || 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Movements (paginated)
// ---------------------------------------------------------------------------
export async function getGastosMovements(
  filters: GastosFilters
): Promise<{ data: GastosMovementListItem[]; total: number }> {
  const { supabase, tenantId } = await getTenantId();

  const page = filters.page ?? 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Build the query for movements
  let query = supabase
    .from("cash_register_movements")
    .select("id, opening_id, cash_register_id, type, amount, description, reason, receipt_number, payment_method, invoice_id, created_by, created_at", {
      count: "exact",
    })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  // Filter by type
  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  // Filter by date range (Peru timezone = UTC-5)
  if (filters.date_from) {
    query = query.gte("created_at", `${filters.date_from}T05:00:00Z`);
  }
  if (filters.date_to) {
    const nextDay = new Date(`${filters.date_to}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    query = query.lt("created_at", `${nextDayStr}T05:00:00Z`);
  }

  // If filtering by branch or cash_register, we need to pre-fetch opening IDs
  if (filters.branch_id || filters.cash_register_id) {
    // Get register IDs matching the filter
    let registerQuery = supabase
      .from("cash_registers")
      .select("id")
      .eq("tenant_id", tenantId);

    if (filters.branch_id) {
      registerQuery = registerQuery.eq("branch_id", filters.branch_id);
    }
    if (filters.cash_register_id) {
      registerQuery = registerQuery.eq("id", filters.cash_register_id);
    }

    const { data: filteredRegisters } = await registerQuery;
    const registerIds = (filteredRegisters || []).map((r) => r.id);

    if (registerIds.length === 0) {
      return { data: [], total: 0 };
    }

    // Get openings for these registers
    const { data: filteredOpenings } = await supabase
      .from("cash_register_openings")
      .select("id")
      .in("cash_register_id", registerIds);
    const filteredOpeningIds = (filteredOpenings || []).map((o) => o.id);

    if (filteredOpeningIds.length === 0 && registerIds.length === 0) {
      return { data: [], total: 0 };
    }

    // Include movements via opening OR direct cash_register_id (petty cash)
    if (filteredOpeningIds.length > 0) {
      query = query.or(
        `opening_id.in.(${filteredOpeningIds.join(",")}),cash_register_id.in.(${registerIds.join(",")})`
      );
    } else {
      query = query.in("cash_register_id", registerIds);
    }
  }

  // Excluir ventas con tarjeta/transferencia (no afectan efectivo de caja)
  query = query.or("type.neq.sale,payment_method.eq.cash,payment_method.is.null");

  const { data: movements, error, count } = await query;
  if (error) throw new Error(error.message);
  if (!movements || movements.length === 0) return { data: [], total: 0 };

  // Batch-fetch opening details (cash_register_id)
  const movOpeningIds = [...new Set(movements.filter((m) => m.opening_id).map((m) => m.opening_id))];
  let openingRegMap: Record<string, string> = {};
  if (movOpeningIds.length > 0) {
    const { data: openings } = await supabase
      .from("cash_register_openings")
      .select("id, cash_register_id")
      .in("id", movOpeningIds);
    if (openings) {
      openingRegMap = Object.fromEntries(openings.map((o) => [o.id, o.cash_register_id]));
    }
  }

  // Collect register IDs: via openings + direct cash_register_id on movements
  const directRegIds = movements
    .filter((m) => m.cash_register_id)
    .map((m) => m.cash_register_id as string);
  const regIds = [...new Set([...Object.values(openingRegMap), ...directRegIds].filter(Boolean))];
  let registerMap: Record<string, { name: string; code: string; branch_id: string | null }> = {};
  if (regIds.length > 0) {
    const { data: regs } = await supabase
      .from("cash_registers")
      .select("id, name, code, branch_id")
      .in("id", regIds);
    if (regs) {
      registerMap = Object.fromEntries(
        regs.map((r) => [r.id, { name: r.name, code: r.code, branch_id: r.branch_id }])
      );
    }
  }

  // Batch-fetch branch names
  const branchIds = [...new Set(Object.values(registerMap).map((r) => r.branch_id).filter(Boolean))] as string[];
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

  // Batch-fetch profile names
  const creatorIds = [...new Set(movements.map((m) => m.created_by).filter(Boolean))];
  let profileMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", creatorIds);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
    }
  }

  const data: GastosMovementListItem[] = movements.map((m) => {
    const regId = m.opening_id
      ? (openingRegMap[m.opening_id] ?? m.cash_register_id ?? null)
      : (m.cash_register_id ?? null);
    const reg = regId ? registerMap[regId] : null;
    return {
      id: m.id,
      opening_id: m.opening_id,
      cash_register_id: m.cash_register_id,
      type: m.type,
      amount: m.amount,
      description: m.description,
      reason: m.reason,
      receipt_number: m.receipt_number,
      payment_method: m.payment_method,
      invoice_id: m.invoice_id ?? null,
      created_at: m.created_at,
      created_by_name: m.created_by ? profileMap[m.created_by] ?? null : null,
      branch_name: reg?.branch_id ? branchMap[reg.branch_id] ?? null : null,
      cash_register_name: reg?.name ?? null,
      cash_register_code: reg?.code ?? null,
    };
  });

  return { data, total: count ?? 0 };
}

// Legacy alias
export const updatePettyCash = addPettyCash;

// ---------------------------------------------------------------------------
// Add Petty Cash (increment-only, direct)
// ---------------------------------------------------------------------------
export async function addPettyCash(input: unknown) {
  const parsed = pettyCashSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase, tenantId, userId } = await getTenantId();
  const { cash_register_id, amount } = parsed.data;

  // Fetch register info (name, code, branch_id)
  const { data: register } = await supabase
    .from("cash_registers")
    .select("id, name, code, branch_id, current_opening_id")
    .eq("id", cash_register_id)
    .eq("tenant_id", tenantId)
    .single();
  if (!register) return { success: false as const, error: "Caja no encontrada" };

  // Insert petty cash movement directly
  const { error } = await supabase.from("cash_register_movements").insert({
    tenant_id: tenantId,
    cash_register_id,
    opening_id: register.current_opening_id || null,
    type: "petty_cash_in",
    amount,
    description: "Recarga de caja chica",
    created_by: userId,
  });

  if (error) return { success: false as const, error: error.message };

  // Notify
  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["contabilidad.gastos"],
    title: "Recarga de caja chica",
    message: `Se añadieron S/ ${amount.toFixed(2)} a caja chica de "${register.name}" (${register.code}).`,
    resourceType: "cash_register",
    resourceId: cash_register_id,
    type: "info",
  });

  revalidatePath("/finanzas/movimientos");
  revalidatePath("/gastos/fondos");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Closing History
// ---------------------------------------------------------------------------
export async function getClosingHistory(
  filters?: ClosingHistoryFilters
): Promise<{ data: ClosingHistoryItem[]; total: number }> {
  const { supabase, tenantId } = await getTenantId();

  const page = filters?.page ?? 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("cash_register_openings")
    .select("id, cash_register_id, opened_by, closed_by, opening_amount, closing_amount, expected_amount, difference, opened_at, closed_at, notes", {
      count: "exact",
    })
    .eq("tenant_id", tenantId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .range(from, to);

  if (filters?.cash_register_id) {
    query = query.eq("cash_register_id", filters.cash_register_id);
  }
  if (filters?.date_from) {
    query = query.gte("closed_at", `${filters.date_from}T05:00:00Z`);
  }
  if (filters?.date_to) {
    const nextDay = new Date(`${filters.date_to}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    query = query.lt("closed_at", `${nextDay.toISOString().split("T")[0]}T05:00:00Z`);
  }

  const { data: openings, error, count } = await query;
  if (error) throw new Error(error.message);
  if (!openings || openings.length === 0) return { data: [], total: 0 };

  // Batch-fetch register info
  const regIds = [...new Set(openings.map((o) => o.cash_register_id))];
  let regMap: Record<string, { name: string; code: string; branch_id: string | null }> = {};
  if (regIds.length > 0) {
    const { data: regs } = await supabase
      .from("cash_registers")
      .select("id, name, code, branch_id")
      .in("id", regIds);
    if (regs) {
      regMap = Object.fromEntries(regs.map((r) => [r.id, { name: r.name, code: r.code, branch_id: r.branch_id }]));
    }
  }

  // Batch-fetch branch names
  const branchIds = [...new Set(Object.values(regMap).map((r) => r.branch_id).filter(Boolean))] as string[];
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

  // Batch-fetch profile names
  const personIds = [...new Set([
    ...openings.map((o) => o.opened_by),
    ...openings.map((o) => o.closed_by).filter(Boolean),
  ])];
  let profileMap: Record<string, string> = {};
  if (personIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", personIds);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
    }
  }

  const data = openings.map((o) => {
    const reg = regMap[o.cash_register_id];
    return {
      id: o.id,
      cash_register_name: reg?.name ?? "Desconocida",
      cash_register_code: reg?.code ?? "",
      branch_name: reg?.branch_id ? branchMap[reg.branch_id] ?? null : null,
      opened_by_name: profileMap[o.opened_by] ?? null,
      closed_by_name: o.closed_by ? profileMap[o.closed_by] ?? null : null,
      opening_amount: o.opening_amount,
      closing_amount: o.closing_amount,
      expected_amount: o.expected_amount,
      difference: o.difference,
      notes: o.notes,
      opened_at: o.opened_at,
      closed_at: o.closed_at,
    };
  });

  return { data, total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Daily Report
// ---------------------------------------------------------------------------
export async function getDailyReport(
  date: string,
  cashRegisterId?: string
): Promise<DailyReportData> {
  const { supabase, tenantId } = await getTenantId();

  // Peru timezone (UTC-5): day starts at 05:00 UTC
  const dayStart = `${date}T05:00:00Z`;
  const nextDay = new Date(`${date}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const dayEnd = `${nextDay.toISOString().split("T")[0]}T05:00:00Z`;

  // Get openings for the day
  let openingsQuery = supabase
    .from("cash_register_openings")
    .select("id, cash_register_id, opened_by, closed_by, opening_amount, closing_amount, expected_amount, difference, opened_at, closed_at, status, notes")
    .eq("tenant_id", tenantId)
    .gte("opened_at", dayStart)
    .lt("opened_at", dayEnd)
    .order("opened_at");

  if (cashRegisterId) {
    openingsQuery = openingsQuery.eq("cash_register_id", cashRegisterId);
  }

  const { data: openingsRaw } = await openingsQuery;
  const openings = openingsRaw || [];

  if (openings.length === 0) {
    return {
      openings: [],
      movements: [],
      sales_by_type: {},
      sales_by_payment: {},
      totals: { total_sales: 0, total_cash_in: 0, total_cash_out: 0, total_refunds: 0 },
    };
  }

  const openingIds = openings.map((o) => o.id);

  // Get register info
  const regIds = [...new Set(openings.map((o) => o.cash_register_id))];
  let regMap: Record<string, { name: string; branch_id: string | null }> = {};
  if (regIds.length > 0) {
    const { data: regs } = await supabase
      .from("cash_registers")
      .select("id, name, branch_id")
      .in("id", regIds);
    if (regs) {
      regMap = Object.fromEntries(regs.map((r) => [r.id, { name: r.name, branch_id: r.branch_id }]));
    }
  }

  // Get branch names
  const branchIds = [...new Set(Object.values(regMap).map((r) => r.branch_id).filter(Boolean))] as string[];
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

  // Get profile names for openers/closers
  const personIds = [
    ...new Set([
      ...openings.map((o) => o.opened_by),
      ...openings.map((o) => o.closed_by).filter(Boolean),
    ]),
  ];
  let profileMap: Record<string, string> = {};
  if (personIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", personIds);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
    }
  }

  // Get movements for these openings
  const { data: movementsRaw } = await supabase
    .from("cash_register_movements")
    .select("id, opening_id, type, amount, description, reason, receipt_number, payment_method, invoice_id, created_by, created_at")
    .in("opening_id", openingIds)
    .order("created_at", { ascending: false });
  const rawMovements = movementsRaw || [];

  // Get creator names
  const creatorIds = [...new Set(rawMovements.map((m) => m.created_by).filter(Boolean))];
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", creatorIds);
    if (profiles) {
      profiles.forEach((p) => {
        profileMap[p.id] = p.full_name;
      });
    }
  }

  // Build opening-to-register map
  const openingRegMap: Record<string, string> = {};
  openings.forEach((o) => {
    openingRegMap[o.id] = o.cash_register_id;
  });

  // Build enriched movements
  const movements: GastosMovementListItem[] = rawMovements.map((m) => {
    const regId = openingRegMap[m.opening_id];
    const reg = regId ? regMap[regId] : null;
    return {
      id: m.id,
      opening_id: m.opening_id,
      cash_register_id: regId ?? null,
      type: m.type,
      amount: m.amount,
      description: m.description,
      reason: m.reason,
      receipt_number: m.receipt_number,
      payment_method: m.payment_method,
      invoice_id: m.invoice_id ?? null,
      created_at: m.created_at,
      created_by_name: m.created_by ? profileMap[m.created_by] ?? null : null,
      branch_name: reg?.branch_id ? branchMap[reg.branch_id] ?? null : null,
      cash_register_name: reg?.name ?? null,
      cash_register_code: null,
    };
  });

  // Aggregate sales by invoice document_type
  const salesByType: Record<string, { count: number; total: number }> = {};
  const salesByPayment: Record<string, number> = {};
  let totalSales = 0;
  let totalCashIn = 0;
  let totalCashOut = 0;
  let totalRefunds = 0;

  rawMovements.forEach((m) => {
    const amt = Number(m.amount);
    switch (m.type) {
      case "sale":
        // Solo ventas en efectivo afectan la caja fisica
        if (!m.payment_method || m.payment_method === "cash") {
          totalSales += amt;
          // Group by payment method for sales
          if (m.payment_method) {
            salesByPayment[m.payment_method] = (salesByPayment[m.payment_method] ?? 0) + amt;
          }
          // Group by description (used as document type label)
          {
            const docType = m.description || "venta";
            if (!salesByType[docType]) salesByType[docType] = { count: 0, total: 0 };
            salesByType[docType].count += 1;
            salesByType[docType].total += amt;
          }
        }
        break;
      case "income":
        totalCashIn += amt;
        break;
      case "expense":
        totalCashOut += amt;
        break;
      case "refund":
        totalRefunds += amt;
        break;
    }
  });

  return {
    openings: openings.map((o) => {
      const reg = regMap[o.cash_register_id];
      return {
        id: o.id,
        opened_by_name: profileMap[o.opened_by] ?? null,
        closed_by_name: o.closed_by ? profileMap[o.closed_by] ?? null : null,
        opening_amount: o.opening_amount,
        closing_amount: o.closing_amount,
        expected_amount: o.expected_amount,
        difference: o.difference,
        opened_at: o.opened_at,
        closed_at: o.closed_at,
        notes: o.notes,
        cash_register_name: reg?.name ?? "Desconocida",
        branch_name: reg?.branch_id ? branchMap[reg.branch_id] ?? null : null,
      };
    }),
    movements,
    sales_by_type: salesByType,
    sales_by_payment: salesByPayment,
    totals: {
      total_sales: totalSales,
      total_cash_in: totalCashIn,
      total_cash_out: totalCashOut,
      total_refunds: totalRefunds,
    },
  };
}

// ---------------------------------------------------------------------------
// Expense Fund — Validate Gerente PIN (internal helper)
// ---------------------------------------------------------------------------
async function validateGerentePin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  pin: string
) {
  // 1. Find PIN in fact_user_assignments (authoritative source for PINs)
  const { data: assignment } = await supabase
    .from("fact_user_assignments")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("pin_code", pin)
    .eq("is_active", true)
    .single();
  if (!assignment) return null;

  // 2. Verify user is gerente
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, cargo")
    .eq("id", assignment.user_id)
    .eq("cargo", "gerente")
    .eq("is_active", true)
    .single();

  return profile;
}

// ---------------------------------------------------------------------------
// Expense Fund — Status per register
// ---------------------------------------------------------------------------
export async function getExpenseFundStatus(): Promise<{
  registers: ExpenseFundStatusItem[];
}> {
  const { supabase, tenantId } = await getTenantId();

  const { data: registers, error } = await supabase
    .from("cash_registers")
    .select("id, name, code, branch_id, petty_cash_amount")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error(error.message);
  if (!registers || registers.length === 0) return { registers: [] };

  // Batch-fetch branch names
  const branchIds = [...new Set(registers.map((r) => r.branch_id).filter(Boolean))];
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

  // Get this month's expense movements from expense_fund_movements
  const peruNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const monthStart = `${peruNow.getFullYear()}-${String(peruNow.getMonth() + 1).padStart(2, "0")}-01T05:00:00Z`;
  const regIds = registers.map((r) => r.id);

  let expenseMap: Record<string, { total: number; count: number }> = {};
  if (regIds.length > 0) {
    const { data: expenseMovs } = await supabase
      .from("expense_fund_movements")
      .select("cash_register_id, amount")
      .eq("tenant_id", tenantId)
      .in("cash_register_id", regIds)
      .eq("type", "expense")
      .gte("created_at", monthStart);

    for (const m of expenseMovs || []) {
      if (!m.cash_register_id) continue;
      if (!expenseMap[m.cash_register_id]) {
        expenseMap[m.cash_register_id] = { total: 0, count: 0 };
      }
      expenseMap[m.cash_register_id].total += Number(m.amount);
      expenseMap[m.cash_register_id].count += 1;
    }
  }

  return {
    registers: registers.map((r) => {
      const capital = Number(r.petty_cash_amount) || 0;
      const expenses = expenseMap[r.id]?.total ?? 0;
      return {
        id: r.id,
        name: r.name,
        code: r.code,
        branch_name: r.branch_id ? branchMap[r.branch_id] ?? null : null,
        capital,
        balance: capital - expenses,
        expenses_count: expenseMap[r.id]?.count ?? 0,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Expense Fund — Adjust (requires gerente PIN)
// ---------------------------------------------------------------------------
export async function adjustExpenseFund(input: unknown) {
  const parsed = adjustExpenseFundSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase, tenantId, userId } = await getTenantId();
  const { cash_register_id, new_amount, pin } = parsed.data;

  // 1. Validate gerente PIN
  const gerente = await validateGerentePin(supabase, tenantId, pin);
  if (!gerente) {
    return { success: false as const, error: "PIN inválido o solo gerentes pueden ajustar fondos" };
  }

  // 2. Update cash_registers.petty_cash_amount
  const { error: updateError } = await supabase
    .from("cash_registers")
    .update({ petty_cash_amount: new_amount })
    .eq("id", cash_register_id)
    .eq("tenant_id", tenantId);

  if (updateError) return { success: false as const, error: updateError.message };

  // 3. Insert expense_fund_movement type='adjustment'
  const { error: movError } = await supabase.from("expense_fund_movements").insert({
    tenant_id: tenantId,
    cash_register_id,
    type: "adjustment",
    amount: new_amount,
    description: `Ajuste de capital mensual a S/ ${new_amount.toFixed(2)}`,
    authorized_by: gerente.id,
    authorized_name: `${gerente.first_name} ${gerente.last_name}`.trim(),
    created_by: userId,
  });

  if (movError) return { success: false as const, error: movError.message };

  // 4. Notify
  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["gastos.fondos"],
    title: "Ajuste de fondo de gastos",
    message: `Capital mensual ajustado a S/ ${new_amount.toFixed(2)}. Autorizado por ${gerente.first_name} ${gerente.last_name}.`,
    resourceType: "cash_register",
    resourceId: cash_register_id,
    type: "info",
  });

  // 5. Revalidate
  revalidatePath("/gastos/fondos");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Expense Fund — Movements (paginated)
// ---------------------------------------------------------------------------
export async function getExpenseFundMovements(
  filters?: ExpenseFundFilters
): Promise<{ data: ExpenseFundMovementItem[]; total: number }> {
  const { supabase, tenantId } = await getTenantId();

  const page = filters?.page ?? 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("expense_fund_movements")
    .select("id, cash_register_id, type, amount, description, reason, receipt_number, authorized_by, authorized_name, created_by, created_at", {
      count: "exact",
    })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters?.cash_register_id) {
    query = query.eq("cash_register_id", filters.cash_register_id);
  }
  if (filters?.type) {
    query = query.eq("type", filters.type);
  }
  if (filters?.date_from) {
    query = query.gte("created_at", `${filters.date_from}T05:00:00Z`);
  }
  if (filters?.date_to) {
    const nextDay = new Date(`${filters.date_to}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    query = query.lt("created_at", `${nextDayStr}T05:00:00Z`);
  }

  const { data: movements, error, count } = await query;
  if (error) throw new Error(error.message);
  if (!movements || movements.length === 0) return { data: [], total: 0 };

  // Batch-fetch cash register info
  const regIds = [...new Set(movements.map((m) => m.cash_register_id).filter(Boolean))];
  let registerMap: Record<string, { name: string; code: string; branch_id: string | null }> = {};
  if (regIds.length > 0) {
    const { data: regs } = await supabase
      .from("cash_registers")
      .select("id, name, code, branch_id")
      .in("id", regIds);
    if (regs) {
      registerMap = Object.fromEntries(
        regs.map((r) => [r.id, { name: r.name, code: r.code, branch_id: r.branch_id }])
      );
    }
  }

  // Batch-fetch branch names
  const branchIds = [...new Set(Object.values(registerMap).map((r) => r.branch_id).filter(Boolean))] as string[];
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

  // Batch-fetch creator names
  const creatorIds = [...new Set(movements.map((m) => m.created_by).filter(Boolean))];
  let profileMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", creatorIds);
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
    }
  }

  const data: ExpenseFundMovementItem[] = movements.map((m) => {
    const reg = m.cash_register_id ? registerMap[m.cash_register_id] : null;
    return {
      id: m.id,
      cash_register_id: m.cash_register_id,
      type: m.type,
      amount: m.amount,
      description: m.description,
      reason: m.reason,
      receipt_number: m.receipt_number,
      authorized_by: m.authorized_by,
      authorized_name: m.authorized_name,
      created_by_name: m.created_by ? profileMap[m.created_by] ?? null : null,
      created_at: m.created_at,
      cash_register_name: reg?.name ?? null,
      cash_register_code: reg?.code ?? null,
      branch_name: reg?.branch_id ? branchMap[reg.branch_id] ?? null : null,
    };
  });

  return { data, total: count ?? 0 };
}
