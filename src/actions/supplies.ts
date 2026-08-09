"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createSupplySchema,
  updateSupplySchema,
  addSupplyStockSchema,
} from "@/lib/validators/supply";
import type {
  SupplyListItem,
  SupplyDetail,
  SupplyFilters,
  SupplyKPIs,
} from "@/types/supply";
import type { PaginatedResult } from "@/types/shared";
import { notifyModuleAction } from "./notifications";
import { requirePermission } from "@/lib/auth/check-permission";
import { insertInventoryMovement } from "@/lib/inventory-movement";
import { broadcastSupplyStockUpdate } from "@/lib/stock-broadcast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SUPPLY_MODULES = ["inventario.insumos"];

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
// List supplies
// ---------------------------------------------------------------------------
export async function getSupplies(
  filters: SupplyFilters,
): Promise<PaginatedResult<SupplyListItem>> {
  const { supabase, tenantId } = await getTenantId();
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let assignmentFilterIds: string[] | null = null;
  if (filters.category_id) {
    const { data: catSupplies } = await supabase
      .from("supply_category_assignments")
      .select("supply_id")
      .eq("category_id", filters.category_id);
    const ids = (catSupplies || []).map((cs) => cs.supply_id);
    if (ids.length === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    assignmentFilterIds = ids;
  }

  if (filters.tag_id) {
    const { data: tagSupplies } = await supabase
      .from("supply_tag_assignments")
      .select("supply_id")
      .eq("tag_id", filters.tag_id);
    const ids = new Set((tagSupplies || []).map((st) => st.supply_id));

    if (assignmentFilterIds) {
      assignmentFilterIds = assignmentFilterIds.filter((id) => ids.has(id));
    } else {
      assignmentFilterIds = Array.from(ids);
    }

    if (assignmentFilterIds.length === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
  }

  let query = supabase
    .from("supplies")
    .select(
      `id, sku, name, description, unit_of_measure, stock_quantity, min_stock,
       cost_price, currency, branch_id, image_url, barcode, available_in_pos,
       is_active`,
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (assignmentFilterIds) query = query.in("id", assignmentFilterIds);
  query = query.eq("is_active", filters.is_active ?? true);
  if (filters.available_in_pos !== undefined)
    query = query.eq("available_in_pos", filters.available_in_pos);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);
  if (filters.branch_id) query = query.eq("branch_id", filters.branch_id);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const supplyIds = (data || []).map((s) => s.id);

  // Batch-fetch categories via M2M
  const categoriesMap: Record<string, { id: string; name: string }[]> = {};
  if (supplyIds.length > 0) {
    const { data: catAssignments } = await supabase
      .from("supply_category_assignments")
      .select("supply_id, category_id, product_categories(id, name)")
      .in("supply_id", supplyIds);

    (catAssignments || []).forEach((a) => {
      if (!categoriesMap[a.supply_id]) categoriesMap[a.supply_id] = [];
      const cat = a.product_categories as unknown as { id: string; name: string };
      if (cat) categoriesMap[a.supply_id].push(cat);
    });
  }

  // Batch-fetch tags via M2M
  const tagsMap: Record<string, { id: string; name: string; color: string | null }[]> = {};
  if (supplyIds.length > 0) {
    const { data: tagAssignments } = await supabase
      .from("supply_tag_assignments")
      .select("supply_id, tag_id, product_tags(id, name, color)")
      .in("supply_id", supplyIds);

    (tagAssignments || []).forEach((a) => {
      if (!tagsMap[a.supply_id]) tagsMap[a.supply_id] = [];
      const tag = a.product_tags as unknown as {
        id: string;
        name: string;
        color: string | null;
      };
      if (tag) tagsMap[a.supply_id].push(tag);
    });
  }

  const total = count ?? 0;

  return {
    data: (data || []).map((s) => ({
      ...s,
      categories: categoriesMap[s.id] || [],
      tags: tagsMap[s.id] || [],
    })) as SupplyListItem[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get supply by ID
// ---------------------------------------------------------------------------
export async function getSupplyById(id: string): Promise<SupplyDetail | null> {
  const { supabase } = await getTenantId();

  const { data, error } = await supabase
    .from("supplies")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;

  // Fetch categories via M2M
  const { data: catAssignments } = await supabase
    .from("supply_category_assignments")
    .select("category_id, product_categories(*)")
    .eq("supply_id", id);

  const categories = (catAssignments || [])
    .map((a) => a.product_categories)
    .filter(Boolean);

  // Fetch tags
  const { data: tagAssignments } = await supabase
    .from("supply_tag_assignments")
    .select("id, tag_id, product_tags(*)")
    .eq("supply_id", id);

  const tags = (tagAssignments || []).map((a) => ({
    ...(a.product_tags as unknown as Record<string, unknown>),
    assignment_id: a.id,
  }));

  // Fetch branch name
  let branchName = "";
  if (data.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", data.branch_id)
      .single();
    branchName = branch?.name || "";
  }

  return {
    ...data,
    categories,
    tags,
    branch_name: branchName,
  } as unknown as SupplyDetail;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
export async function getSupplyKPIs(): Promise<SupplyKPIs> {
  const { supabase, tenantId } = await getTenantId();

  const [totalActive, lowStock, outOfStock, posEnabled, allActive] =
    await Promise.all([
      supabase
        .from("supplies")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      supabase
        .from("supplies")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .gt("stock_quantity", 0)
        .not("min_stock", "is", null)
        .filter("stock_quantity", "lte", "min_stock"),
      supabase
        .from("supplies")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("stock_quantity", 0),
      supabase
        .from("supplies")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .eq("available_in_pos", true),
      // Fetch stock_quantity + cost_price for total_value calculation
      supabase
        .from("supplies")
        .select("stock_quantity, cost_price")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
    ]);

  // Compute total value manually
  const totalValue = (allActive.data || []).reduce((sum, s) => {
    return sum + (s.stock_quantity || 0) * (s.cost_price || 0);
  }, 0);

  return {
    total_supplies: totalActive.count ?? 0,
    low_stock_count: lowStock.count ?? 0,
    out_of_stock_count: outOfStock.count ?? 0,
    pos_enabled_count: posEnabled.count ?? 0,
    total_value: totalValue,
  };
}

// ---------------------------------------------------------------------------
// Create supply (direct)
// ---------------------------------------------------------------------------
export async function createSupply(input: unknown) {
  const parsed = createSupplySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.insumos", "create"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const {
    tag_ids,
    category_ids,
    image_url,
    description,
    cost_price,
    min_stock,
    stock_quantity,
    barcode: inputBarcode,
    branch_id,
    ...rest
  } = parsed.data;

  // Generate SKU
  const { data: skuResult, error: skuError } = await supabase.rpc("fn_generate_supply_sku", {
    p_tenant_id: tenantId,
  });
  if (skuError || !skuResult) {
    return {
      success: false as const,
      error: `No se pudo generar el SKU del insumo: ${skuError?.message ?? "respuesta vacía del servidor"}`,
    };
  }
  const sku = skuResult;

  // Insert supply as active directly
  const { data: supply, error } = await supabase
    .from("supplies")
    .insert({
      ...rest,
      tenant_id: tenantId,
      sku,
      description: description || null,
      cost_price: cost_price ?? 0,
      min_stock: min_stock ?? 0,
      stock_quantity: stock_quantity ?? 0,
      barcode: inputBarcode?.trim() || null,
      branch_id,
      image_url: image_url || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return { success: false as const, error: error.message };

  // Insert category assignments (M2M)
  if (category_ids && category_ids.length > 0) {
    await supabase.from("supply_category_assignments").insert(
      category_ids.map((category_id) => ({ supply_id: supply.id, category_id })),
    );
  }

  // Insert tag assignments
  if (tag_ids && tag_ids.length > 0) {
    await supabase.from("supply_tag_assignments").insert(
      tag_ids.map((tag_id) => ({ supply_id: supply.id, tag_id })),
    );
  }

  // Create initial stock movement if stock > 0. Ver el comentario gemelo en
  // `products.createProduct`: el insumo ya existe con su stock, así que el fallo
  // se avisa y no se deshace nada.
  let stockMovementWarning: string | null = null;
  const initialStock = stock_quantity ?? 0;
  if (initialStock > 0) {
    const { error: movError } = await insertInventoryMovement(
      supabase,
      {
        tenant_id: tenantId,
        entity_type: "supply",
        entity_id: supply.id,
        quantity: initialStock,
        movement_type: "income",
        reason: "Stock inicial",
        branch_id: branch_id,
        created_by: userId,
      },
      { userId },
    );
    if (movError) {
      stockMovementWarning = `${movError} El stock inicial quedó en el insumo pero no en el kardex.`;
    }
  }

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: SUPPLY_MODULES,
    title: "Insumo creado",
    message: `Se creó el insumo "${rest.name}" (${sku}).`,
    resourceType: "supply",
    resourceId: supply.id,
    type: "info",
  }).catch((e) => console.error("[createSupply] notify error:", e));

  revalidatePath("/inventario/insumos");
  return {
    success: true as const,
    supplyId: supply.id,
    warning: stockMovementWarning ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Update supply (direct)
// ---------------------------------------------------------------------------
export async function updateSupply(id: string, input: unknown) {
  const parsed = updateSupplySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.insumos", "edit"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { tag_ids, category_ids, image_url, description, ...rest } = parsed.data;

  // Get current supply data
  const { data: current } = await supabase
    .from("supplies")
    .select("*")
    .eq("id", id)
    .single();
  if (!current) return { success: false as const, error: "Insumo no encontrado" };

  // Build update payload
  const updatePayload: Record<string, unknown> = { ...rest };
  if (description !== undefined) updatePayload.description = description || null;
  if (image_url !== undefined) updatePayload.image_url = image_url;

  // Apply scalar update
  const { error } = await supabase
    .from("supplies")
    .update(updatePayload)
    .eq("id", id);

  if (error) return { success: false as const, error: error.message };

  // Update category assignments (M2M)
  if (category_ids !== undefined) {
    await supabase.from("supply_category_assignments").delete().eq("supply_id", id);
    if (category_ids.length > 0) {
      await supabase.from("supply_category_assignments").insert(
        category_ids.map((category_id) => ({ supply_id: id, category_id })),
      );
    }
  }

  // Update tag assignments (M2M)
  if (tag_ids !== undefined) {
    await supabase.from("supply_tag_assignments").delete().eq("supply_id", id);
    if (tag_ids.length > 0) {
      await supabase.from("supply_tag_assignments").insert(
        tag_ids.map((tag_id) => ({ supply_id: id, tag_id })),
      );
    }
  }

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: SUPPLY_MODULES,
    title: "Insumo actualizado",
    message: `Se actualizó el insumo "${current.name}" (${current.sku}).`,
    resourceType: "supply",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[updateSupply] notify error:", e));

  revalidatePath("/inventario/insumos");
  revalidatePath(`/inventario/insumos/${id}`);
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Delete supply (direct)
// ---------------------------------------------------------------------------
export async function deleteSupply(id: string) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.insumos", "delete"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  // Get supply info
  const { data: supply } = await supabase
    .from("supplies")
    .select("name, sku")
    .eq("id", id)
    .single();
  if (!supply) return { success: false as const, error: "Insumo no encontrado" };

  // Soft-delete: mark as inactive so POI Fact sync picks it up and hides it
  const { error } = await supabase
    .from("supplies")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { success: false as const, error: error.message };

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: SUPPLY_MODULES,
    title: "Insumo eliminado",
    message: `Se eliminó el insumo "${supply.name}" (${supply.sku}).`,
    resourceType: "supply",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[deleteSupply] notify error:", e));

  revalidatePath("/inventario/insumos");
  return {
    success: true as const,
    message: "Insumo eliminado exitosamente.",
  };
}

// ---------------------------------------------------------------------------
// Add supply stock (direct)
// ---------------------------------------------------------------------------
export async function addSupplyStock(supplyId: string, input: unknown) {
  const parsed = addSupplyStockSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.insumos", "edit"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { quantity, supplier_ruc, invoice_code, notes } = parsed.data;

  // Get supply info (including branch_id for sede display)
  const { data: supply } = await supabase
    .from("supplies")
    .select("name, sku, branch_id")
    .eq("id", supplyId)
    .single();
  if (!supply) return { success: false as const, error: "Insumo no encontrado" };

  // Update stock quantity (atomic via RPC to prevent race conditions)
  const { data: newStock, error: updateError } = await supabase.rpc("fn_increment_supply_stock", {
    p_supply_id: supplyId,
    p_quantity: quantity,
  });

  if (updateError) return { success: false as const, error: updateError.message };

  // Los insumos nunca viajaron por el canal de realtime: `stockUpdates` sólo
  // llevaba `product_id`.
  if (typeof newStock === "number") {
    void broadcastSupplyStockUpdate(tenantId, supplyId, newStock).catch((e) =>
      console.error("[addSupplyStock] broadcast error:", e),
    );
  }

  // Create stock movement record. El stock ya subió por RPC: el fallo se avisa.
  const { error: movError } = await insertInventoryMovement(
    supabase,
    {
      tenant_id: tenantId,
      entity_type: "supply",
      entity_id: supplyId,
      quantity,
      movement_type: "income",
      reason: "Ingreso de stock",
      notes: notes || null,
      branch_id: supply.branch_id,
      supplier_ruc: supplier_ruc || null,
      invoice_code: invoice_code || null,
      created_by: userId,
    },
    { userId },
  );

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: SUPPLY_MODULES,
    title: "Stock de insumo actualizado",
    message: `Se agregaron ${quantity} unidades al insumo "${supply.name}" (${supply.sku}).`,
    resourceType: "supply",
    resourceId: supplyId,
    type: "info",
  }).catch((e) => console.error("[addSupplyStock] notify error:", e));

  revalidatePath("/inventario/insumos");
  revalidatePath(`/inventario/insumos/${supplyId}`);
  return {
    success: true as const,
    message: "Stock actualizado exitosamente.",
    warning: movError ?? undefined,
  };
}
