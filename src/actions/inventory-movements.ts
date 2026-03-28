"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createInventoryMovementSchema } from "@/lib/validators/inventory-movement";
import type {
  InventoryMovement,
  InventoryMovementFilters,
  MovementKPIs,
} from "@/types/inventory-movement";
import type { PaginatedResult } from "@/types/shared";
import { notifyModuleAction } from "./notifications";
import { requirePermission } from "@/lib/auth/check-permission";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOVEMENT_MODULES = ["inventario.movimientos"];

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
// List inventory movements
// ---------------------------------------------------------------------------
export async function getInventoryMovements(
  filters: InventoryMovementFilters,
): Promise<PaginatedResult<InventoryMovement>> {
  const { supabase, tenantId } = await getTenantId();
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const hasDateFilter = !!filters.date_from || !!filters.date_to;
  const hasTimeOnlyFilter = !hasDateFilter && (!!filters.time_from || !!filters.time_to);

  let query = supabase
    .from("inventory_movements")
    .select(
      `id, tenant_id, entity_type, entity_id, quantity, movement_type,
       reason, notes, branch_id, supplier_ruc, invoice_code, invoice_id,
       created_by, created_at`,
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  // Time-only filter: fetch all (up to 1000), filter in JS, paginate manually
  if (!hasTimeOnlyFilter) {
    query = query.range(from, to);
  } else {
    query = query.limit(1000);
  }

  if (filters.entity_type) query = query.eq("entity_type", filters.entity_type);
  if (filters.entity_id) query = query.eq("entity_id", filters.entity_id);
  if (filters.movement_type) query = query.eq("movement_type", filters.movement_type);
  if (filters.branch_id) query = query.eq("branch_id", filters.branch_id);

  // Date (+optional time) filter with Peru timezone offset
  if (filters.date_from) {
    const time = filters.time_from || "00:00";
    query = query.gte("created_at", `${filters.date_from}T${time}:00-05:00`);
  }
  if (filters.date_to) {
    const time = filters.time_to || "23:59";
    query = query.lte("created_at", `${filters.date_to}T${time}:59-05:00`);
  }
  if (filters.search) {
    // Search will be applied client-side after entity name resolution
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  let rows = data || [];
  let total = count ?? 0;

  // Time-only filter: filter by Peru time in JS, then paginate manually
  if (hasTimeOnlyFilter) {
    rows = rows.filter((r) => {
      const peruTime = new Date(r.created_at).toLocaleTimeString("en-GB", {
        timeZone: "America/Lima",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
      if (filters.time_from && peruTime < filters.time_from) return false;
      if (filters.time_to && peruTime > filters.time_to) return false;
      return true;
    });
    total = rows.length;
    rows = rows.slice(from, to + 1);
  }

  // Batch resolve entity names by entity_type
  const productIds = [
    ...new Set(rows.filter((r) => r.entity_type === "product").map((r) => r.entity_id)),
  ];
  const supplyIds = [
    ...new Set(rows.filter((r) => r.entity_type === "supply").map((r) => r.entity_id)),
  ];

  const productMap = new Map<string, { name: string; sku: string }>();
  const supplyMap = new Map<string, { name: string; sku: string }>();

  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku")
      .in("id", productIds);
    (products || []).forEach((p) => {
      productMap.set(p.id, { name: p.name, sku: p.sku });
    });
  }

  if (supplyIds.length > 0) {
    const { data: supplies } = await supabase
      .from("supplies")
      .select("id, name, sku")
      .in("id", supplyIds);
    (supplies || []).forEach((s) => {
      supplyMap.set(s.id, { name: s.name, sku: s.sku });
    });
  }

  // Batch resolve created_by names
  const creatorIds = [
    ...new Set(rows.map((r) => r.created_by).filter(Boolean) as string[]),
  ];
  const profileMap = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", creatorIds);
    (profiles || []).forEach((p) => {
      profileMap.set(p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "");
    });
  }

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

  let enriched: InventoryMovement[] = rows.map((r) => {
    let entityInfo: { name: string; sku: string } | undefined;
    if (r.entity_type === "product") {
      entityInfo = productMap.get(r.entity_id);
    } else if (r.entity_type === "supply") {
      entityInfo = supplyMap.get(r.entity_id);
    }

    return {
      ...r,
      entity_name: entityInfo?.name || "",
      entity_sku: entityInfo?.sku || "",
      created_by_name: r.created_by ? profileMap.get(r.created_by) || "" : "",
      branch_name: r.branch_id ? branchMap.get(r.branch_id) || "" : "",
    };
  });

  // Client-side search filter (against entity_name / entity_sku)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    enriched = enriched.filter(
      (m) =>
        (m.entity_name || "").toLowerCase().includes(term) ||
        (m.entity_sku || "").toLowerCase().includes(term),
    );
  }

  return {
    data: enriched,
    total: filters.search ? enriched.length : total,
    page,
    pageSize,
    totalPages: Math.ceil((filters.search ? enriched.length : total) / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get movements for a specific entity (product or supply)
// ---------------------------------------------------------------------------
export async function getEntityMovements(
  entityType: "product" | "supply",
  entityId: string,
  limit: number = 10,
): Promise<InventoryMovement[]> {
  const { supabase, tenantId } = await getTenantId();

  const { data, error } = await supabase
    .from("inventory_movements")
    .select(
      `id, tenant_id, entity_type, entity_id, quantity, movement_type,
       reason, notes, branch_id, supplier_ruc, invoice_code, invoice_id,
       created_by, created_at`,
    )
    .eq("tenant_id", tenantId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Batch resolve creator names
  const creatorIds = [...new Set(data.filter((r) => r.created_by).map((r) => r.created_by!))];
  const creatorMap = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", creatorIds);
    (profiles || []).forEach((p) => creatorMap.set(p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || ""));
  }

  // Batch resolve branch names
  const branchIds = [...new Set(data.map((r) => r.branch_id))];
  const branchMap = new Map<string, string>();
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);
    (branches || []).forEach((b) => branchMap.set(b.id, b.name));
  }

  // Batch resolve invoice numbers for sale movements
  const invoiceIds = [...new Set(data.filter((r) => r.invoice_id).map((r) => r.invoice_id!))];
  const invoiceMap = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, correlative_number, invoice_series:series_id ( series_code )")
      .in("id", invoiceIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invoices || []).forEach((inv: any) => {
      const series = inv.invoice_series?.series_code ?? "";
      const corr = String(inv.correlative_number ?? "").padStart(8, "0");
      invoiceMap.set(inv.id, `${series}-${corr}`);
    });
  }

  return data.map((m) => ({
    ...m,
    created_by_name: m.created_by ? creatorMap.get(m.created_by) ?? null : null,
    branch_name: branchMap.get(m.branch_id) ?? null,
    invoice_number: m.invoice_id ? invoiceMap.get(m.invoice_id) ?? null : null,
  })) as InventoryMovement[];
}

// ---------------------------------------------------------------------------
// Create inventory movement (direct)
// ---------------------------------------------------------------------------
export async function createInventoryMovement(input: unknown) {
  const parsed = createInventoryMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.movimientos", "create"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { entity_type, entity_id, quantity, movement_type, reason, notes, branch_id, responsible_id } =
    parsed.data;

  // Get entity info
  let entityName = "";
  let entitySku = "";
  let currentStock = 0;
  if (entity_type === "product") {
    const { data: product } = await supabase
      .from("products")
      .select("name, sku, stock_quantity")
      .eq("id", entity_id)
      .single();
    if (!product)
      return { success: false as const, error: "Producto no encontrado" };
    entityName = product.name;
    entitySku = product.sku;
    currentStock = product.stock_quantity || 0;
  } else if (entity_type === "supply") {
    const { data: supply } = await supabase
      .from("supplies")
      .select("name, sku, stock_quantity")
      .eq("id", entity_id)
      .single();
    if (!supply) return { success: false as const, error: "Insumo no encontrado" };
    entityName = supply.name;
    entitySku = supply.sku;
    currentStock = supply.stock_quantity || 0;
  }

  const resolvedBranchId = branch_id && branch_id.length > 0 ? branch_id : null;

  // Insert movement record
  const { error: movError } = await supabase
    .from("inventory_movements")
    .insert({
      tenant_id: tenantId,
      entity_type,
      entity_id,
      quantity,
      movement_type,
      reason: reason || null,
      notes: notes || null,
      branch_id: resolvedBranchId,
      created_by: responsible_id || userId,
    });

  if (movError) return { success: false as const, error: movError.message };

  // Update stock based on movement type
  const isIncrease = movement_type === "income" || (movement_type as string) === "return";
  const newStock = isIncrease ? currentStock + quantity : Math.max(0, currentStock - quantity);
  const table = entity_type === "product" ? "products" : "supplies";

  await supabase
    .from(table)
    .update({ stock_quantity: newStock })
    .eq("id", entity_id);

  const entityLabel = entity_type === "product" ? "producto" : "insumo";

  void notifyModuleAction({
    tenantId,
    actorId: responsible_id || userId,
    moduleCodes: MOVEMENT_MODULES,
    title: "Movimiento de inventario registrado",
    message: `Se registro un movimiento (${movement_type}) de ${quantity} unidades del ${entityLabel} "${entityName}" (${entitySku}).`,
    resourceType: "inventory_movement",
    resourceId: entity_id,
    type: "info",
  }).catch((e) => console.error("[createInventoryMovement] notify error:", e));

  revalidatePath("/inventario/movimientos");
  return {
    success: true as const,
  };
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
export async function getMovementKPIs(): Promise<MovementKPIs> {
  const { supabase, tenantId } = await getTenantId();

  const [total, waste, shrinkage, adjustment, income, sale, cortesia] = await Promise.all([
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("movement_type", "waste"),
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("movement_type", "shrinkage"),
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("movement_type", "adjustment"),
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("movement_type", "income"),
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("movement_type", "sale"),
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("movement_type", "cortesia"),
  ]);

  return {
    total_movements: total.count ?? 0,
    waste_count: waste.count ?? 0,
    shrinkage_count: shrinkage.count ?? 0,
    adjustment_count: adjustment.count ?? 0,
    income_count: income.count ?? 0,
    sale_count: sale.count ?? 0,
    cortesia_count: cortesia.count ?? 0,
  };
}
