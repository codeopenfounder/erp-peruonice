"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createCategorySchema, createTagSchema, updateCategorySchema, updateTagSchema } from "@/lib/validators/product";
import type { CategoryWithTags, ProductCategory, ProductTag } from "@/types/product";
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

const INVENTORY_MODULES = ["inventario.productos", "inventario.servicios"];

function formatInventoryLabelError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    if (error.message.includes("idx_product_tags_unique_name")) {
      return "Ya existe una etiqueta activa con ese nombre en esta categoria.";
    }
    if (error.message.includes("idx_product_categories_unique_name")) {
      return "Ya existe una categoria activa con ese nombre en el mismo nivel.";
    }
  }

  return error.message;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function getCategories(type?: string): Promise<CategoryWithTags[]> {
  const { supabase, tenantId } = await getTenantId();

  let query = supabase
    .from("product_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (type && type !== "both") {
    query = query.in("type", [type, "both"]);
  }

  const { data: categories, error } = await query;
  if (error) throw new Error(error.message);

  const categoryIds = (categories || []).map((c) => c.id);
  if (categoryIds.length === 0) return [];

  const tagsQuery = supabase
    .from("product_tags")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("category_id", categoryIds)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const countQuery =
    type === "supply"
      ? supabase
          .from("supply_category_assignments")
          .select("category_id, supplies!inner(id)")
          .in("category_id", categoryIds)
          .eq("supplies.tenant_id", tenantId)
          .eq("supplies.is_active", true)
      : supabase
          .from("product_category_assignments")
          .select("category_id, products!inner(id)")
          .in("category_id", categoryIds)
          .eq("products.tenant_id", tenantId)
          .eq("products.is_active", true);

  if (type === "product" || type === "service") {
    countQuery.eq("products.type", type);
  }

  const [{ data: tags }, { data: itemCounts }] = await Promise.all([tagsQuery, countQuery]);

  const countMap: Record<string, number> = {};
  (itemCounts || []).forEach((item) => {
    if (item.category_id) {
      countMap[item.category_id] = (countMap[item.category_id] || 0) + 1;
    }
  });

  const tagsByCategory: Record<string, ProductTag[]> = {};
  tags?.forEach((tag) => {
    if (!tagsByCategory[tag.category_id]) tagsByCategory[tag.category_id] = [];
    tagsByCategory[tag.category_id].push(tag as ProductTag);
  });

  function buildTree(parentId: string | null): CategoryWithTags[] {
    return (categories || [])
      .filter((c) => c.parent_id === parentId)
      .map((c) => ({
        ...(c as ProductCategory),
        tags: tagsByCategory[c.id] || [],
        product_count: countMap[c.id] || 0,
        children: buildTree(c.id),
      }));
  }

  return buildTree(null);
}

export async function createCategory(input: unknown) {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId;
  try {
    ({ supabase, tenantId } = await requirePermission("inventario.productos", "create"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { name, type, sort_order, parent_id } = parsed.data;

  const { data, error } = await supabase
    .from("product_categories")
    .insert({
      tenant_id: tenantId,
      name,
      type,
      sort_order: sort_order ?? 0,
      parent_id: parent_id || null,
    })
    .select()
    .single();

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/inventario");
  return { success: true as const, categoryId: data.id };
}

export async function updateCategory(id: string, input: unknown) {
  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase } = await getTenantId();

  const { error } = await supabase
    .from("product_categories")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { success: false as const, error: formatInventoryLabelError(error) };

  revalidatePath("/inventario");
  return { success: true as const };
}

export async function deleteCategory(id: string) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.productos", "delete"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  // Get category info
  const { data: category } = await supabase
    .from("product_categories")
    .select("name")
    .eq("id", id)
    .single();
  if (!category) return { success: false as const, error: "Categoría no encontrada" };

  // Soft-delete: mark as inactive so POI Fact sync picks it up and hides it
  const { error } = await supabase
    .from("product_categories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { success: false as const, error: formatInventoryLabelError(error) };

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: INVENTORY_MODULES,
    title: "Categoría eliminada",
    message: `Se eliminó la categoría "${category.name}".`,
    resourceType: "product_category",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[deleteCategory] notify error:", e));

  revalidatePath("/inventario");
  return { success: true as const, message: "Categoría eliminada exitosamente." };
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function createTag(input: unknown) {
  const parsed = createTagSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId;
  try {
    ({ supabase, tenantId } = await requirePermission("inventario.productos", "create"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { category_id, name, color, sort_order } = parsed.data;

  const { data, error } = await supabase
    .from("product_tags")
    .insert({
      tenant_id: tenantId,
      category_id,
      name,
      color: color || null,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return { success: false as const, error: formatInventoryLabelError(error) };

  revalidatePath("/inventario");
  return { success: true as const, tagId: data.id };
}

export async function updateTag(id: string, input: unknown) {
  const parsed = updateTagSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase } = await getTenantId();

  const { error } = await supabase
    .from("product_tags")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { success: false as const, error: formatInventoryLabelError(error) };

  revalidatePath("/inventario");
  return { success: true as const };
}

export async function deleteTag(id: string) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("inventario.productos", "delete"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  // Get tag info
  const { data: tag } = await supabase
    .from("product_tags")
    .select("name")
    .eq("id", id)
    .single();
  if (!tag) return { success: false as const, error: "Etiqueta no encontrada" };

  // Soft-delete: mark as inactive so POI Fact sync picks it up and hides it
  const { error } = await supabase
    .from("product_tags")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { success: false as const, error: error.message };

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: INVENTORY_MODULES,
    title: "Etiqueta eliminada",
    message: `Se eliminó la etiqueta "${tag.name}".`,
    resourceType: "product_tag",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[deleteTag] notify error:", e));

  revalidatePath("/inventario");
  return { success: true as const, message: "Etiqueta eliminada exitosamente." };
}
