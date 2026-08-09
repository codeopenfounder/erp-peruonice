"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAuditSchema } from "@/lib/validators/inventory-audit";
import type {
  InventoryAudit,
  InventoryAuditItem,
  AuditRow,
  AuditFilters,
  AuditKPIs,
} from "@/types/inventory-audit";
import type { PaginatedResult } from "@/types/shared";
import { notifyModuleAction } from "./notifications";
import { requirePermission } from "@/lib/auth/check-permission";
import { broadcastBatchStockUpdate, ERP_SOURCE } from "@/lib/stock-broadcast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AUDIT_MODULES = ["inventario.auditoria"];

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
export async function getAuditKPIs(): Promise<AuditKPIs> {
  const { supabase, tenantId } = await getTenantId();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. Get approved audit IDs from last 30d
  const { data: recentAudits } = await supabase
    .from("inventory_audits")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .gte("created_at", thirtyDaysAgo.toISOString());

  const recentIds = (recentAudits || []).map((a) => a.id);

  let audited_last_30d = 0;
  if (recentIds.length > 0) {
    const { count } = await supabase
      .from("inventory_audit_items")
      .select("entity_id", { count: "exact", head: true })
      .in("audit_id", recentIds);
    audited_last_30d = count ?? 0;
  }

  // 2. Count "at risk" items: active simple products + active supplies not audited in 30+ days
  const { count: totalProducts } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("type", "product")
    .eq("product_kind", "simple")
    .eq("is_active", true);

  const { count: totalSupplies } = await supabase
    .from("supplies")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const totalItems = (totalProducts ?? 0) + (totalSupplies ?? 0);
  const at_risk_count = Math.max(0, totalItems - audited_last_30d);

  // 3. Last audit date
  const { data: lastAudit } = await supabase
    .from("inventory_audits")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 4. Total audits
  const { count: totalAudits } = await supabase
    .from("inventory_audits")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  return {
    audited_last_30d,
    at_risk_count,
    last_audit_date: lastAudit?.created_at ?? null,
    total_audits: totalAudits ?? 0,
  };
}

// ---------------------------------------------------------------------------
// List audits (paginated)
// ---------------------------------------------------------------------------
export async function getAudits(
  filters: AuditFilters,
): Promise<PaginatedResult<InventoryAudit>> {
  const { supabase, tenantId } = await getTenantId();
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("inventory_audits")
    .select(
      `id, tenant_id, branch_id, status, items_audited, items_adjusted,
       total_discrepancy_value, audited_by, notes, created_at, decided_at`,
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.branch_id) query = query.eq("branch_id", filters.branch_id);
  if (filters.date_from) {
    query = query.gte("created_at", `${filters.date_from}T05:00:00Z`);
  }
  if (filters.date_to) {
    const nextDay = new Date(`${filters.date_to}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    query = query.lt("created_at", `${nextDay.toISOString().split("T")[0]}T05:00:00Z`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = data || [];
  const total = count ?? 0;

  // Batch resolve branch names
  const branchIds = [
    ...new Set(rows.map((r) => r.branch_id).filter(Boolean) as string[]),
  ];
  const branchMap = new Map<string, string>();
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);
    (branches || []).forEach((b) => {
      branchMap.set(b.id, b.name);
    });
  }

  // Batch resolve audited_by names
  const auditorIds = [
    ...new Set(rows.map((r) => r.audited_by).filter(Boolean) as string[]),
  ];
  const profileMap = new Map<string, string>();
  if (auditorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", auditorIds);
    (profiles || []).forEach((p) => {
      profileMap.set(p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "");
    });
  }

  const enriched: InventoryAudit[] = rows.map((r) => ({
    ...r,
    items_audited: Number(r.items_audited),
    items_adjusted: Number(r.items_adjusted),
    total_discrepancy_value: Number(r.total_discrepancy_value),
    branch_name: r.branch_id ? branchMap.get(r.branch_id) || "" : "",
    audited_by_name: r.audited_by ? profileMap.get(r.audited_by) || "" : "",
  }));

  return {
    data: enriched,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get single audit by ID (with items)
// ---------------------------------------------------------------------------
export async function getAuditById(
  auditId: string,
): Promise<{ audit: InventoryAudit; items: InventoryAuditItem[] } | null> {
  const { supabase, tenantId } = await getTenantId();

  const { data: audit, error } = await supabase
    .from("inventory_audits")
    .select(
      `id, tenant_id, branch_id, status, items_audited, items_adjusted,
       total_discrepancy_value, audited_by, notes, created_at, decided_at`,
    )
    .eq("id", auditId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !audit) return null;

  // Resolve branch name
  let branchName = "";
  if (audit.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", audit.branch_id)
      .single();
    branchName = branch?.name || "";
  }

  // Resolve audited_by name
  let auditorName = "";
  if (audit.audited_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", audit.audited_by)
      .single();
    auditorName = profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "";
  }

  // Fetch audit items
  const { data: items } = await supabase
    .from("inventory_audit_items")
    .select(
      `id, audit_id, entity_type, entity_id, entity_name, entity_sku,
       cost_price, theoretical_stock, physical_stock, difference, cost_impact`,
    )
    .eq("audit_id", auditId)
    .order("entity_name", { ascending: true });

  // Coerce NUMERIC fields to numbers (Supabase may return strings for numeric(12,4))
  const coercedItems: InventoryAuditItem[] = (items || []).map((item) => ({
    ...item,
    cost_price: Number(item.cost_price),
    theoretical_stock: Number(item.theoretical_stock),
    physical_stock: Number(item.physical_stock),
    difference: Number(item.difference),
    cost_impact: Number(item.cost_impact),
  }));

  return {
    audit: {
      ...audit,
      items_audited: Number(audit.items_audited),
      items_adjusted: Number(audit.items_adjusted),
      total_discrepancy_value: Number(audit.total_discrepancy_value),
      branch_name: branchName,
      audited_by_name: auditorName,
    },
    items: coercedItems,
  };
}

// ---------------------------------------------------------------------------
// Get auditable items for a branch
// ---------------------------------------------------------------------------
export async function getAuditableItems(
  branchId: string,
  categoryId?: string,
  atRiskOnly?: boolean,
): Promise<AuditRow[]> {
  const { supabase, tenantId } = await getTenantId();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. Fetch active simple products (products are tenant-scoped, not branch-scoped)
  const productQuery = supabase
    .from("products")
    .select("id, name, sku, cost_price, stock_quantity, unit_of_measure")
    .eq("tenant_id", tenantId)
    .eq("type", "product")
    .eq("product_kind", "simple")
    .eq("is_active", true);

  const { data: products } = await productQuery;

  // 2. Fetch active supplies from the branch
  const supplyQuery = supabase
    .from("supplies")
    .select("id, name, sku, cost_price, stock_quantity, unit_of_measure")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("branch_id", branchId);

  const { data: supplies } = await supplyQuery;

  // 3. If categoryId provided, filter by category assignments
  let filteredProductIds: Set<string> | null = null;
  let filteredSupplyIds: Set<string> | null = null;

  if (categoryId) {
    const { data: productAssignments } = await supabase
      .from("product_category_assignments")
      .select("product_id")
      .eq("category_id", categoryId);
    filteredProductIds = new Set((productAssignments || []).map((a) => a.product_id));

    const { data: supplyAssignments } = await supabase
      .from("supply_category_assignments")
      .select("supply_id")
      .eq("category_id", categoryId);
    filteredSupplyIds = new Set((supplyAssignments || []).map((a) => a.supply_id));
  }

  // 4. Find last_audited_at for each entity from approved audits
  const { data: approvedAudits } = await supabase
    .from("inventory_audits")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const approvedAuditIds = (approvedAudits || []).map((a) => a.id);
  const auditDateMap = new Map<string, string>();
  (approvedAudits || []).forEach((a) => auditDateMap.set(a.id, a.created_at));

  // Build entity → last_audited_at map
  const lastAuditedMap = new Map<string, string>();

  if (approvedAuditIds.length > 0) {
    const { data: auditItems } = await supabase
      .from("inventory_audit_items")
      .select("entity_id, audit_id")
      .in("audit_id", approvedAuditIds);

    for (const item of auditItems || []) {
      const auditDate = auditDateMap.get(item.audit_id);
      if (auditDate) {
        const existing = lastAuditedMap.get(item.entity_id);
        if (!existing || auditDate > existing) {
          lastAuditedMap.set(item.entity_id, auditDate);
        }
      }
    }
  }

  // 5. Build rows
  const rows: AuditRow[] = [];

  for (const p of products || []) {
    if (filteredProductIds && !filteredProductIds.has(p.id)) continue;

    const lastAudited = lastAuditedMap.get(p.id) || null;
    if (atRiskOnly && lastAudited && new Date(lastAudited) > thirtyDaysAgo) continue;

    rows.push({
      entity_type: "product",
      entity_id: p.id,
      entity_name: p.name,
      entity_sku: p.sku,
      unit_of_measure: p.unit_of_measure || "NIU",
      cost_price: Number(p.cost_price) || 0,
      theoretical_stock: Number(p.stock_quantity) || 0,
      physical_stock: null,
      difference: 0,
      cost_impact: 0,
      last_audited_at: lastAudited,
    });
  }

  for (const s of supplies || []) {
    if (filteredSupplyIds && !filteredSupplyIds.has(s.id)) continue;

    const lastAudited = lastAuditedMap.get(s.id) || null;
    if (atRiskOnly && lastAudited && new Date(lastAudited) > thirtyDaysAgo) continue;

    rows.push({
      entity_type: "supply",
      entity_id: s.id,
      entity_name: s.name,
      entity_sku: s.sku,
      unit_of_measure: s.unit_of_measure || "NIU",
      cost_price: Number(s.cost_price) || 0,
      theoretical_stock: Number(s.stock_quantity) || 0,
      physical_stock: null,
      difference: 0,
      cost_impact: 0,
      last_audited_at: lastAudited,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Create audit (direct)
// ---------------------------------------------------------------------------
export async function createAudit(input: unknown) {
  const parsed = createAuditSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.auditoria", "create"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { branch_id, notes, items, responsible_id } = parsed.data;

  // Get branch name
  let branchName = "";
  const { data: branch } = await supabase
    .from("branches")
    .select("name")
    .eq("id", branch_id)
    .single();
  branchName = branch?.name || "";

  // Calculate summary (coerce to Number for safety with NUMERIC fields)
  const items_audited = items.length;
  const items_adjusted = items.filter((i) => Number(i.difference) !== 0).length;
  const total_discrepancy_value = items.reduce((sum, i) => sum + Number(i.cost_impact), 0);

  // INSERT into inventory_audits as approved directly
  const { data: audit, error: auditError } = await supabase
    .from("inventory_audits")
    .insert({
      tenant_id: tenantId,
      branch_id,
      status: "approved",
      items_audited,
      items_adjusted,
      total_discrepancy_value,
      audited_by: responsible_id || userId,
      notes: notes || null,
      decided_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (auditError || !audit) {
    return { success: false as const, error: auditError?.message || "Error al crear auditoria" };
  }

  // INSERT batch into inventory_audit_items (coerce NUMERIC fields)
  const auditItems = items.map((i) => ({
    audit_id: audit.id,
    entity_type: i.entity_type,
    entity_id: i.entity_id,
    entity_name: i.entity_name,
    entity_sku: i.entity_sku,
    cost_price: Number(i.cost_price),
    theoretical_stock: Number(i.theoretical_stock),
    physical_stock: Number(i.physical_stock),
    difference: Number(i.difference),
    cost_impact: Number(i.cost_impact),
  }));

  const { error: itemsError } = await supabase
    .from("inventory_audit_items")
    .insert(auditItems);

  if (itemsError) {
    return { success: false as const, error: itemsError.message };
  }

  // Apply stock adjustments for items with differences (atomic via RPC)
  const auditProductUpdates: { product_id: string; stock_quantity: number }[] = [];
  const auditSupplyUpdates: { supply_id: string; stock_quantity: number }[] = [];

  for (const item of items) {
    const diff = Number(item.difference);
    if (diff === 0) continue;

    const absDiff = Math.abs(diff);
    if (item.entity_type === "supply") {
      const { data: remaining } = diff < 0
        ? await supabase.rpc("fn_decrement_supply_stock", { p_supply_id: item.entity_id, p_quantity: absDiff })
        : await supabase.rpc("fn_increment_supply_stock", { p_supply_id: item.entity_id, p_quantity: absDiff });
      if (typeof remaining === "number") {
        auditSupplyUpdates.push({ supply_id: item.entity_id, stock_quantity: remaining });
      }
    } else {
      const { data: remaining } = diff < 0
        ? await supabase.rpc("fn_decrement_stock", { p_product_id: item.entity_id, p_quantity: absDiff })
        : await supabase.rpc("fn_increment_stock", { p_product_id: item.entity_id, p_quantity: absDiff });
      if (typeof remaining === "number") {
        auditProductUpdates.push({ product_id: item.entity_id, stock_quantity: remaining });
      }
    }

    // Create inventory movement for the adjustment
    await supabase.from("inventory_movements").insert({
      tenant_id: tenantId,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      quantity: Math.abs(diff),
      movement_type: "adjustment",
      reason: `Auditoría de inventario — ${diff > 0 ? "sobrante" : "faltante"}`,
      notes: notes || null,
      branch_id,
      created_by: responsible_id || userId,
    });
  }

  void notifyModuleAction({
    tenantId,
    actorId: responsible_id || userId,
    moduleCodes: AUDIT_MODULES,
    title: "Auditoría de inventario registrada",
    message: `Se registró una auditoría en sede "${branchName}" con ${items_audited} items (${items_adjusted} con diferencia). Impacto: S/ ${total_discrepancy_value.toFixed(2)}.`,
    resourceType: "inventory_audit",
    resourceId: audit.id,
    type: "info",
  }).catch((e) => console.error("[createAudit] notify error:", e));

  // Una auditoría es el ajuste de stock más grande que existe y no llegaba a
  // ninguna caja hasta el pull siguiente: hasta 2 minutos vendiendo contra el
  // stock viejo. Se emite en un solo lote.
  void broadcastBatchStockUpdate(
    tenantId,
    auditProductUpdates,
    ERP_SOURCE,
    auditSupplyUpdates,
  ).catch((e) => console.error("[createAudit] broadcast error:", e));

  revalidatePath("/inventario/auditoria");
  return {
    success: true as const,
    auditId: audit.id,
  };
}
