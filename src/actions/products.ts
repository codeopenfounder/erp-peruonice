"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createProductSchema, updateProductSchema, addStockSchema } from "@/lib/validators/product";
import type { ProductListItem, ProductDetail, ProductFilters, ProductKPIs } from "@/types/product";
import { getEntityMovements } from "./inventory-movements";
import type { PaginatedResult } from "@/types/shared";
import { notifyModuleAction } from "./notifications";
import { requirePermission } from "@/lib/auth/check-permission";

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

function getInventoryModules(isService: boolean) {
  return isService
    ? ["inventario.servicios"]
    : ["inventario.productos"];
}

// ---------------------------------------------------------------------------
// List products
// ---------------------------------------------------------------------------
export async function getProducts(filters: ProductFilters): Promise<PaginatedResult<ProductListItem>> {
  const { supabase, tenantId } = await getTenantId();
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // If filtering by category_id, pre-fetch product IDs from M2M
  let categoryFilterIds: string[] | null = null;
  if (filters.category_id) {
    const { data: catProducts } = await supabase
      .from("product_category_assignments")
      .select("product_id")
      .eq("category_id", filters.category_id);
    const ids = (catProducts || []).map((cp) => cp.product_id);
    if (ids.length === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    categoryFilterIds = ids;
  }

  let query = supabase
    .from("products")
    .select(
      `id, sku, name, type, product_kind, unit_price, cost_price, currency,
       tax_type, igv_rate, stock_quantity, min_stock, unit_of_measure, barcode, image_url, is_active, branch_id, is_schedulable`,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.product_kind) query = query.eq("product_kind", filters.product_kind);
  if (categoryFilterIds) query = query.in("id", categoryFilterIds);
  if (filters.is_active !== undefined) query = query.eq("is_active", filters.is_active);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);
  // branch_id filter removed (column doesn't exist on products)

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const productIds = (data || []).map((p) => p.id);

  // Batch-fetch categories via M2M
  let categoriesMap: Record<string, { id: string; name: string }[]> = {};
  if (productIds.length > 0) {
    const { data: catAssignments } = await supabase
      .from("product_category_assignments")
      .select("product_id, category_id, product_categories(id, name)")
      .in("product_id", productIds);

    (catAssignments || []).forEach((a) => {
      if (!categoriesMap[a.product_id]) categoriesMap[a.product_id] = [];
      const cat = a.product_categories as unknown as { id: string; name: string };
      if (cat) categoriesMap[a.product_id].push(cat);
    });
  }

  // Batch-fetch tags via M2M
  let tagsMap: Record<string, { id: string; name: string; color: string | null }[]> = {};
  if (productIds.length > 0) {
    const { data: assignments } = await supabase
      .from("product_tag_assignments")
      .select("product_id, tag_id, product_tags(id, name, color)")
      .in("product_id", productIds);

    (assignments || []).forEach((a) => {
      if (!tagsMap[a.product_id]) tagsMap[a.product_id] = [];
      const tag = a.product_tags as unknown as { id: string; name: string; color: string | null };
      if (tag) tagsMap[a.product_id].push(tag);
    });
  }

  // Recalculate stock for composite products (based on supply availability)
  const compositeIds = (data || []).filter(p => p.product_kind === "composite").map(p => p.id);
  const compositeStockMap: Record<string, number> = {};
  if (compositeIds.length > 0) {
    for (const cid of compositeIds) {
      try {
        const { data: calcStock } = await supabase.rpc("fn_calculate_composite_stock", { p_product_id: cid });
        if (typeof calcStock === "number") {
          compositeStockMap[cid] = calcStock;
          // Also update the stored value so other views see it
          await supabase.from("products").update({ stock_quantity: calcStock }).eq("id", cid);
        }
      } catch {
        // Non-critical: fallback to stored value
      }
    }
  }

  const total = count ?? 0;

  if (filters.tag_id) {
    const filteredIds = new Set(
      Object.entries(tagsMap)
        .filter(([, tags]) => tags.some((t) => t.id === filters.tag_id))
        .map(([id]) => id)
    );
    const filtered = (data || []).filter((p) => filteredIds.has(p.id));
    return {
      data: filtered.map((p) => ({
        ...p,
        stock_quantity: compositeStockMap[p.id] ?? p.stock_quantity,
        categories: categoriesMap[p.id] || [],
        tags: tagsMap[p.id] || [],
      })) as ProductListItem[],
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.ceil(filtered.length / pageSize),
    };
  }

  return {
    data: (data || []).map((p) => ({
      ...p,
      stock_quantity: compositeStockMap[p.id] ?? p.stock_quantity,
      categories: categoriesMap[p.id] || [],
      tags: tagsMap[p.id] || [],
    })) as ProductListItem[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get product by ID
// ---------------------------------------------------------------------------
export async function getProductById(id: string): Promise<ProductDetail | null> {
  const { supabase } = await getTenantId();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;

  // Fetch categories via M2M
  const { data: catAssignments } = await supabase
    .from("product_category_assignments")
    .select("category_id, product_categories(*)")
    .eq("product_id", id);

  const categories = (catAssignments || [])
    .map((a) => a.product_categories)
    .filter(Boolean);

  // Fetch tags
  const { data: tagAssignments } = await supabase
    .from("product_tag_assignments")
    .select("id, tag_id, product_tags(*)")
    .eq("product_id", id);

  const tags = (tagAssignments || []).map((a) => ({
    ...(a.product_tags as unknown as Record<string, unknown>),
    assignment_id: a.id,
  }));

  // Fetch recipe items for composite products
  let recipeItems: unknown[] = [];
  if (data.product_kind === "composite") {
    const { data: recipes } = await supabase
      .from("recipe_items")
      .select(
        "id, product_id, supply_id, quantity_needed, unit_of_measure, sort_order, supplies(name, sku, stock_quantity, unit_of_measure)",
      )
      .eq("product_id", id)
      .order("sort_order");
    recipeItems = (recipes || []).map((r: Record<string, unknown>) => ({
      ...r,
      supply_name: (r.supplies as Record<string, unknown> | null)?.name,
      supply_sku: (r.supplies as Record<string, unknown> | null)?.sku,
      supply_stock: (r.supplies as Record<string, unknown> | null)?.stock_quantity,
      supply_unit: (r.supplies as Record<string, unknown> | null)?.unit_of_measure,
    }));
  }

  // Fetch branch name
  let branch_name = "";
  if (data.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", data.branch_id)
      .single();
    branch_name = branch?.name || "";
  }

  return {
    ...data,
    categories,
    tags,
    recipe_items: recipeItems,
    branch_name,
  } as unknown as ProductDetail;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
export async function getProductKPIs(): Promise<ProductKPIs> {
  const { supabase, tenantId } = await getTenantId();

  const [products, services, lowStock, outOfStock, categories] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("type", "product")
      .eq("is_active", true),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("type", "service")
      .eq("is_active", true),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("type", "product")
      .eq("is_active", true)
      .gt("stock_quantity", 0)
      .not("min_stock", "is", null)
      .filter("stock_quantity", "lte", "min_stock"),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("type", "product")
      .eq("is_active", true)
      .eq("stock_quantity", 0),
    supabase
      .from("product_categories")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
  ]);

  return {
    total_products: products.count ?? 0,
    total_services: services.count ?? 0,
    low_stock_count: lowStock.count ?? 0,
    out_of_stock_count: outOfStock.count ?? 0,
    total_categories: categories.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Create product (direct)
// ---------------------------------------------------------------------------
export async function createProduct(input: unknown) {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.productos", "create"));
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
    invoice_code,
    supplier_ruc,
    barcode: inputBarcode,
    barcode_format: _barcodeFormat,
    branch_id: inputBranchId,
    product_kind,
    recipe_items: recipeItems,
    ...rest
  } = parsed.data;

  const isService = rest.type === "service";

  // Generate SKU
  const { data: skuResult } = await supabase.rpc("fn_generate_product_sku", {
    p_tenant_id: tenantId,
    p_type: rest.type,
  });
  const sku = skuResult || `${isService ? "SRV" : "PRD"}-00001`;

  // Generate or validate barcode for products only (not services)
  let barcode: string | null = null;
  
  if (!isService) {
    if (inputBarcode && inputBarcode.trim()) {
      // Manual barcode — validate EAN-13 format (13 digits with check digit)
      const code = inputBarcode.trim();
      if (!/^\d{13}$/.test(code)) {
        return { success: false as const, error: "Código de barras inválido: debe ser EAN-13 (exactamente 13 dígitos)" };
      }
      // Validate check digit (GS1 Modulo 10)
      const d = code.split("").map(Number);
      const checkDigit = d[12];
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += d[i] * (i % 2 === 0 ? 1 : 3);
      }
      const calculated = (10 - (sum % 10)) % 10;
      if (calculated !== checkDigit) {
        return { success: false as const, error: `Código de barras inválido: el dígito de verificación debería ser ${calculated}, no ${checkDigit}` };
      }
      barcode = code;

    } else {
      // Auto-generate barcode
      const { data: barcodeResult } = await supabase.rpc("fn_generate_product_barcode", {
        p_tenant_id: tenantId,
      });
      barcode = barcodeResult || null;
    }
  }

  const isComposite = (product_kind || "simple") === "composite";

  // Insert product as active directly
  const { data: product, error } = await supabase
    .from("products")
    .insert({
      ...rest,
      tenant_id: tenantId,
      sku,
      product_kind: product_kind || "simple",
      description: description || null,
      cost_price: cost_price ?? 0,
      min_stock: min_stock ?? 0,
      stock_quantity: isComposite ? 0 : (stock_quantity ?? 0),
      barcode,
      branch_id: inputBranchId || null,
      image_url: image_url || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return { success: false as const, error: error.message };

  // Insert category assignments (M2M)
  if (category_ids && category_ids.length > 0) {
    await supabase.from("product_category_assignments").insert(
      category_ids.map((category_id) => ({ product_id: product.id, category_id }))
    );
  }

  // Insert tag assignments
  if (tag_ids && tag_ids.length > 0) {
    await supabase.from("product_tag_assignments").insert(
      tag_ids.map((tag_id) => ({ product_id: product.id, tag_id }))
    );
  }

  // Insert recipe items for composite products
  if (isComposite && recipeItems && recipeItems.length > 0) {
    await supabase.from("recipe_items").insert(
      recipeItems.map((item, index) => ({
        product_id: product.id,
        supply_id: item.supply_id,
        quantity_needed: item.quantity_needed,
        unit_of_measure: item.unit_of_measure || "NIU",
        sort_order: index,
      })),
    );
  }

  // Create initial stock movement if stock > 0
  const initialStock = isComposite ? 0 : (stock_quantity ?? 0);
  if (initialStock > 0) {
    await supabase.from("inventory_movements").insert({
      tenant_id: tenantId,
      entity_type: "product",
      entity_id: product.id,
      quantity: initialStock,
      movement_type: "income",
      reason: "Stock inicial",
      notes: invoice_code ? `Factura: ${invoice_code}` : null,
      branch_id: inputBranchId || (await supabase.from("branches").select("id").eq("tenant_id", tenantId).limit(1).single()).data?.id,
      supplier_ruc: supplier_ruc || null,
      invoice_code: invoice_code || null,
      created_by: userId,
    });
  }

  const label = isService ? "servicio" : "producto";

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: getInventoryModules(isService),
    title: `${label.charAt(0).toUpperCase() + label.slice(1)} creado`,
    message: `Se creó el ${label} "${rest.name}" (${sku}).`,
    resourceType: "product",
    resourceId: product.id,
    type: "info",
  }).catch((e) => console.error("[createProduct] notify error:", e));

  revalidatePath("/inventario/productos");
  revalidatePath("/inventario/servicios");
  return { success: true as const, productId: product.id };
}

// ---------------------------------------------------------------------------
// Update product (direct)
// ---------------------------------------------------------------------------
export async function updateProduct(id: string, input: unknown) {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.productos", "edit"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { tag_ids, category_ids, image_url, description, barcode_format: _bf, recipe_items: recipeItemsInput, ...rest } = parsed.data;

  // Get current product data
  const { data: current } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (!current) return { success: false as const, error: "Producto no encontrado" };

  const isService = current.type === "service";
  const label = isService ? "servicio" : "producto";

  // Build update payload
  const updatePayload: Record<string, unknown> = { ...rest };
  if (description !== undefined) updatePayload.description = description || null;
  if (image_url !== undefined) updatePayload.image_url = image_url;

  // Apply scalar update
  const { error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", id);

  if (error) return { success: false as const, error: error.message };

  // Update category assignments (M2M)
  if (category_ids !== undefined) {
    await supabase.from("product_category_assignments").delete().eq("product_id", id);
    if (category_ids.length > 0) {
      await supabase.from("product_category_assignments").insert(
        category_ids.map((category_id) => ({ product_id: id, category_id }))
      );
    }
  }

  // Update tag assignments (M2M)
  if (tag_ids !== undefined) {
    await supabase.from("product_tag_assignments").delete().eq("product_id", id);
    if (tag_ids.length > 0) {
      await supabase.from("product_tag_assignments").insert(
        tag_ids.map((tag_id) => ({ product_id: id, tag_id }))
      );
    }
  }

  // Update recipe items (M2M) for composite products
  if (recipeItemsInput !== undefined && current.product_kind === "composite") {
    await supabase.from("recipe_items").delete().eq("product_id", id);
    if (recipeItemsInput.length > 0) {
      await supabase.from("recipe_items").insert(
        recipeItemsInput.map((ri: { supply_id: string; quantity_needed: number; unit_of_measure?: string }, idx: number) => ({
          product_id: id,
          supply_id: ri.supply_id,
          quantity_needed: ri.quantity_needed,
          unit_of_measure: ri.unit_of_measure || "NIU",
          sort_order: idx,
        }))
      );
    }
    // Recalculate composite stock
    const { data: newStock } = await supabase.rpc("fn_calculate_composite_stock", { p_product_id: id });
    await supabase.from("products").update({ stock_quantity: newStock ?? 0 }).eq("id", id);
  }

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: getInventoryModules(isService),
    title: `${label.charAt(0).toUpperCase() + label.slice(1)} actualizado`,
    message: `Se actualizó el ${label} "${current.name}" (${current.sku}).`,
    resourceType: "product",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[updateProduct] notify error:", e));

  revalidatePath("/inventario/productos");
  revalidatePath("/inventario/servicios");
  revalidatePath(`/inventario/productos/${id}`);
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Delete product (direct)
// ---------------------------------------------------------------------------
export async function deleteProduct(id: string) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.productos", "delete"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  // Get product info
  const { data: product } = await supabase
    .from("products")
    .select("name, sku, type")
    .eq("id", id)
    .single();
  if (!product) return { success: false as const, error: "Producto no encontrado" };

  const isService = product.type === "service";
  const label = isService ? "servicio" : "producto";

  // Soft-delete: mark as inactive so POI Fact sync picks it up and hides it
  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { success: false as const, error: error.message };

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: getInventoryModules(isService),
    title: `${label.charAt(0).toUpperCase() + label.slice(1)} eliminado`,
    message: `Se eliminó el ${label} "${product.name}" (${product.sku}).`,
    resourceType: "product",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[deleteProduct] notify error:", e));

  revalidatePath("/inventario/productos");
  revalidatePath("/inventario/servicios");
  return { success: true as const, message: `${label.charAt(0).toUpperCase() + label.slice(1)} eliminado exitosamente.` };
}

// ---------------------------------------------------------------------------
// Add product stock (direct)
// ---------------------------------------------------------------------------
export async function addProductStock(productId: string, input: unknown) {
  const parsed = addStockSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.productos", "edit"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { quantity, supplier_ruc, invoice_code, notes } = parsed.data;

  // Get product info (including branch_id for sede display)
  const { data: product } = await supabase
    .from("products")
    .select("name, sku, type")
    .eq("id", productId)
    .single();
  if (!product) return { success: false as const, error: "Producto no encontrado" };

  // Update stock quantity (atomic via RPC to prevent race conditions)
  const { error: updateError } = await supabase.rpc("fn_increment_stock", {
    p_product_id: productId,
    p_quantity: quantity,
  });

  if (updateError) return { success: false as const, error: updateError.message };

  // Create stock movement record
  const { data: defaultBranch } = await supabase.from("branches").select("id").eq("tenant_id", tenantId).limit(1).single();
  await supabase.from("inventory_movements").insert({
    tenant_id: tenantId,
    entity_type: "product",
    entity_id: productId,
    quantity,
    movement_type: "income",
    reason: "Ingreso de stock",
    notes: notes || null,
    branch_id: defaultBranch?.id,
    supplier_ruc: supplier_ruc || null,
    invoice_code: invoice_code || null,
    created_by: userId,
  });

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: getInventoryModules(false),
    title: "Stock actualizado",
    message: `Se agregaron ${quantity} unidades al producto "${product.name}" (${product.sku}).`,
    resourceType: "product",
    resourceId: productId,
    type: "info",
  }).catch((e) => console.error("[addProductStock] notify error:", e));

  revalidatePath("/inventario/productos");
  revalidatePath(`/inventario/productos/${productId}`);
  return { success: true as const, message: "Stock actualizado exitosamente." };
}

// ---------------------------------------------------------------------------
// Get stock movements for a product
// ---------------------------------------------------------------------------
/** @deprecated Use getEntityMovements("product", productId) from inventory-movements instead */
export async function getStockMovements(productId: string) {
  return getEntityMovements("product", productId);
}

// ---------------------------------------------------------------------------
// Update stock (legacy — kept for backward compatibility, now just redirects)
// ---------------------------------------------------------------------------
export async function updateProductStock(id: string, quantity: number) {
  return addProductStock(id, { quantity, invoice_code: "", notes: "Ajuste manual" });
}
