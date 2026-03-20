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

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function getCategories(type?: string): Promise<CategoryWithTags[]> {
  const { supabase, tenantId } = await getTenantId();

  let query = supabase
    .from("product_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (type && type !== "both") {
    query = query.in("type", [type, "both"]);
  }

  const { data: categories, error } = await query;
  if (error) throw new Error(error.message);

  const { data: tags } = await supabase
    .from("product_tags")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  // Count products per category via M2M
  const categoryIds = (categories || []).map((c) => c.id);
  const { data: productCounts } = await supabase
    .from("product_category_assignments")
    .select("category_id, product_id")
    .in("category_id", categoryIds.length > 0 ? categoryIds : ["00000000-0000-0000-0000-000000000000"]);

  const countMap: Record<string, number> = {};
  (productCounts || []).forEach((p) => {
    if (p.category_id) {
      countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
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

  if (error) return { success: false as const, error: error.message };

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
  if (!category) return { success: false as const, error: "Categoria no encontrada" };

  // Delete M2M assignments
  await supabase.from("product_category_assignments").delete().eq("category_id", id);
  await supabase.from("supply_category_assignments").delete().eq("category_id", id);

  // Delete tags belonging to this category
  await supabase.from("product_tags").delete().eq("category_id", id);

  // Delete the category
  const { error } = await supabase.from("product_categories").delete().eq("id", id);
  if (error) return { success: false as const, error: error.message };

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: INVENTORY_MODULES,
    title: "Categoria eliminada",
    message: `Se elimino la categoria "${category.name}".`,
    resourceType: "product_category",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[deleteCategory] notify error:", e));

  revalidatePath("/inventario");
  return { success: true as const, message: "Categoria eliminada exitosamente." };
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

  if (error) return { success: false as const, error: error.message };

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

  if (error) return { success: false as const, error: error.message };

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

  // Delete M2M assignments
  await supabase.from("product_tag_assignments").delete().eq("tag_id", id);
  await supabase.from("supply_tag_assignments").delete().eq("tag_id", id);

  // Delete the tag
  const { error } = await supabase.from("product_tags").delete().eq("id", id);
  if (error) return { success: false as const, error: error.message };

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: INVENTORY_MODULES,
    title: "Etiqueta eliminada",
    message: `Se elimino la etiqueta "${tag.name}".`,
    resourceType: "product_tag",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[deleteTag] notify error:", e));

  revalidatePath("/inventario");
  return { success: true as const, message: "Etiqueta eliminada exitosamente." };
}
