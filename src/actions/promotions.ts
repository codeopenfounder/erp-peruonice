"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPromotionSchema, updatePromotionSchema } from "@/lib/validators/promotion";
import { notifyModuleAction } from "./notifications";
import { requirePermission } from "@/lib/auth/check-permission";
import type {
  PromotionListItem,
  PromotionDetail,
  PromotionFilters,
  PromotionKPIs,
  PromotionStatus,
  PromotionComboItem,
} from "@/types/promotion";
import type { PaginatedResult } from "@/types/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert naive datetime-local string to Peru-aware ISO for TIMESTAMPTZ storage */
function toPeruISO(naive: string | null | undefined): string | null {
  if (!naive) return null;
  // datetime-local produces "YYYY-MM-DDTHH:mm" — append seconds + Peru offset
  return naive.includes("T") ? `${naive}:00-05:00` : null;
}

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

function computeStatus(promo: {
  is_active: boolean;
  stock: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
}): PromotionStatus {
  if (!promo.is_active) return "inactive";
  if (promo.stock !== null && promo.used_count >= promo.stock) return "depleted";
  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) return "scheduled";
  if (promo.valid_until && new Date(promo.valid_until) < now) return "expired";
  return "active";
}

// ---------------------------------------------------------------------------
// List promotions
// ---------------------------------------------------------------------------
export async function getPromotions(filters: PromotionFilters): Promise<PaginatedResult<PromotionListItem>> {
  const { supabase, tenantId } = await getTenantId();
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("promotions")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.discount_type) query = query.eq("discount_type", filters.discount_type);
  if (filters.applies_to) query = query.eq("applies_to", filters.applies_to);
  if (filters.is_active !== undefined) query = query.eq("is_active", filters.is_active);
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const promoIds = (data || []).map((p) => p.id);

  let categoryCountMap: Record<string, number> = {};
  let tagCountMap: Record<string, number> = {};
  let branchCountMap: Record<string, number> = {};

  if (promoIds.length > 0) {
    const [catFilters, tagFilters, branchFilters] = await Promise.all([
      supabase.from("promotion_category_filters").select("promotion_id").in("promotion_id", promoIds),
      supabase.from("promotion_tag_filters").select("promotion_id").in("promotion_id", promoIds),
      supabase.from("promotion_branch_filters").select("promotion_id").in("promotion_id", promoIds),
    ]);

    catFilters.data?.forEach((f) => {
      categoryCountMap[f.promotion_id] = (categoryCountMap[f.promotion_id] || 0) + 1;
    });
    tagFilters.data?.forEach((f) => {
      tagCountMap[f.promotion_id] = (tagCountMap[f.promotion_id] || 0) + 1;
    });
    branchFilters.data?.forEach((f) => {
      branchCountMap[f.promotion_id] = (branchCountMap[f.promotion_id] || 0) + 1;
    });
  }

  const items: PromotionListItem[] = (data || []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    discount_type: p.discount_type,
    discount_value: p.discount_value,
    applies_to: p.applies_to,
    applies_every: p.applies_every ?? 0,
    stock: p.stock,
    used_count: p.used_count,
    valid_from: p.valid_from,
    valid_until: p.valid_until,
    restricted_hour_from: p.restricted_hour_from,
    restricted_hour_until: p.restricted_hour_until,
    is_combo: p.is_combo ?? false,
    combo_price: p.combo_price ?? null,
    is_active: p.is_active,
    computed_status: computeStatus(p),
    category_count: categoryCountMap[p.id] || 0,
    tag_count: tagCountMap[p.id] || 0,
    branch_count: branchCountMap[p.id] || 0,
  }));

  const total = count ?? 0;

  if (filters.status) {
    const filtered = items.filter((i) => i.computed_status === filters.status);
    return {
      data: filtered,
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.ceil(filtered.length / pageSize),
    };
  }

  return {
    data: items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get promotion by ID
// ---------------------------------------------------------------------------
export async function getPromotionById(id: string): Promise<PromotionDetail | null> {
  const { supabase } = await getTenantId();

  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;

  const [branchFilters, catFilters, tagFilters] = await Promise.all([
    supabase
      .from("promotion_branch_filters")
      .select("*, branches(name)")
      .eq("promotion_id", id),
    supabase
      .from("promotion_category_filters")
      .select("*, product_categories(name)")
      .eq("promotion_id", id),
    supabase
      .from("promotion_tag_filters")
      .select("*, product_tags(name)")
      .eq("promotion_id", id),
  ]);

  // Fetch combo items if is_combo
  let combo_items: PromotionComboItem[] = [];
  if (data.is_combo) {
    const { data: comboData } = await supabase
      .from("promotion_combo_items")
      .select("id, promotion_id, product_id, quantity")
      .eq("promotion_id", id);

    if (comboData && comboData.length > 0) {
      const productIds = comboData.map((c: { product_id: string }) => c.product_id);
      const { data: products } = await supabase
        .from("products")
        .select("id, name, sku, unit_price")
        .in("id", productIds);
      const productMap = new Map((products || []).map((p: { id: string; name: string; sku: string; unit_price: number }) => [p.id, p]));

      combo_items = comboData.map((c: { id: string; promotion_id: string; product_id: string; quantity: number }) => ({
        ...c,
        product_name: productMap.get(c.product_id)?.name,
        product_sku: productMap.get(c.product_id)?.sku,
        product_price: productMap.get(c.product_id)?.unit_price,
      }));
    }
  }

  return {
    ...data,
    branch_filters: (branchFilters.data || []).map((f) => ({
      ...f,
      branch_name: (f.branches as unknown as { name: string })?.name ?? "",
    })),
    category_filters: (catFilters.data || []).map((f) => ({
      ...f,
      category_name: (f.product_categories as unknown as { name: string })?.name ?? "",
    })),
    tag_filters: (tagFilters.data || []).map((f) => ({
      ...f,
      tag_name: (f.product_tags as unknown as { name: string })?.name ?? "",
    })),
    combo_items,
  } as unknown as PromotionDetail;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
export async function getPromotionKPIs(): Promise<PromotionKPIs> {
  const { supabase, tenantId } = await getTenantId();

  const { data: all } = await supabase
    .from("promotions")
    .select("is_active, stock, used_count, valid_from, valid_until")
    .eq("tenant_id", tenantId);

  const promos = all || [];
  let active = 0;
  let scheduled = 0;
  let expired = 0;
  let totalUses = 0;

  promos.forEach((p) => {
    const status = computeStatus(p);
    if (status === "active") active++;
    if (status === "scheduled") scheduled++;
    if (status === "expired") expired++;
    totalUses += p.used_count;
  });

  return { total_active: active, total_scheduled: scheduled, total_expired: expired, total_uses: totalUses };
}

// ---------------------------------------------------------------------------
// Create promotion (direct)
// ---------------------------------------------------------------------------
export async function createPromotion(input: unknown) {
  try {
    const parsed = createPromotionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.flatten().fieldErrors };
    }

    const { supabase, tenantId, userId } = await requirePermission("inventario.promociones", "create");
    const {
      category_ids,
      tag_ids,
      branch_ids,
      valid_from,
      valid_until,
      restricted_hour_from,
      restricted_hour_until,
      description,
      applies_every,
      is_combo,
      combo_price,
      combo_items,
      ...rest
    } = parsed.data;

    // Force combo overrides
    const promoInsert = {
      ...rest,
      tenant_id: tenantId,
      description: description || null,
      applies_every: applies_every ?? 0,
      valid_from: toPeruISO(valid_from),
      valid_until: toPeruISO(valid_until),
      restricted_hour_from: restricted_hour_from || null,
      restricted_hour_until: restricted_hour_until || null,
      is_active: true,
      is_combo: is_combo ?? false,
      combo_price: is_combo ? (combo_price ?? null) : null,
    };

    if (is_combo) {
      promoInsert.applies_to = "products";
      promoInsert.discount_type = "fixed_amount";
      promoInsert.discount_value = 0;
    }

    // Insert promotion as active
    const { data: promo, error } = await supabase
      .from("promotions")
      .insert(promoInsert)
      .select()
      .single();

    if (error) return { success: false as const, error: error.message };

    // Insert combo items if is_combo
    if (is_combo && combo_items && combo_items.length > 0) {
      const comboRows = combo_items.map((ci: { product_id: string; quantity: number }) => ({
        promotion_id: promo.id,
        product_id: ci.product_id,
        quantity: ci.quantity,
      }));
      const { error: comboError } = await supabase
        .from("promotion_combo_items")
        .insert(comboRows);
      if (comboError) {
        // Rollback: delete the promotion
        await supabase.from("promotions").delete().eq("id", promo.id);
        return { success: false as const, error: comboError.message };
      }
    }

    // Insert filters with error handling + rollback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filterInserts: PromiseLike<{ error: any }>[] = [];

    // Don't insert category/tag filters for combos
    if (!is_combo && category_ids.length > 0) {
      filterInserts.push(
        supabase.from("promotion_category_filters").insert(
          category_ids.map((cid) => ({ promotion_id: promo.id, category_id: cid }))
        )
      );
    }

    if (!is_combo && tag_ids && tag_ids.length > 0) {
      filterInserts.push(
        supabase.from("promotion_tag_filters").insert(
          tag_ids.map((tid) => ({ promotion_id: promo.id, tag_id: tid }))
        )
      );
    }

    if (branch_ids.length > 0) {
      filterInserts.push(
        supabase.from("promotion_branch_filters").insert(
          branch_ids.map((bid) => ({ promotion_id: promo.id, branch_id: bid }))
        )
      );
    }

    if (filterInserts.length > 0) {
      const results = await Promise.all(filterInserts);
      const failed = results.find((r) => r.error);
      if (failed) {
        await supabase.from("promotions").delete().eq("id", promo.id);
        return { success: false as const, error: "Error guardando filtros: " + failed.error.message };
      }
    }

    void notifyModuleAction({
      tenantId,
      actorId: userId,
      moduleCodes: ["inventario.promociones"],
      title: "Promoción creada",
      message: `Se creó la promoción "${rest.name}" (${rest.code}).`,
      resourceType: "promotion",
      resourceId: promo.id,
      type: "info",
    }).catch((e) => console.error("[createPromotion] notify error:", e));

    revalidatePath("/inventario/promociones");
    return { success: true as const, promotionId: promo.id };
  } catch (err) {
    console.error("[createPromotion] unexpected error:", err);
    return { success: false as const, error: err instanceof Error ? err.message : "Error inesperado al crear promoción" };
  }
}

// ---------------------------------------------------------------------------
// Update promotion (direct)
// ---------------------------------------------------------------------------
export async function updatePromotion(id: string, input: unknown) {
  try {
    const parsed = updatePromotionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.flatten().fieldErrors };
    }

    const { supabase, tenantId, userId } = await requirePermission("inventario.promociones", "edit");
    const {
      category_ids,
      tag_ids,
      branch_ids,
      valid_from,
      valid_until,
      restricted_hour_from,
      restricted_hour_until,
      description,
      applies_every,
      ...rest
    } = parsed.data;

    // Get current promotion data
    const { data: current } = await supabase
      .from("promotions")
      .select("*")
      .eq("id", id)
      .single();
    if (!current) return { success: false as const, error: "Promoción no encontrada" };

    // Build update payload
    const updatePayload: Record<string, unknown> = { ...rest };
    if (description !== undefined) updatePayload.description = description || null;
    if (applies_every !== undefined) updatePayload.applies_every = applies_every;
    if (valid_from !== undefined) updatePayload.valid_from = toPeruISO(valid_from);
    if (valid_until !== undefined) updatePayload.valid_until = toPeruISO(valid_until);
    if (restricted_hour_from !== undefined) updatePayload.restricted_hour_from = restricted_hour_from || null;
    if (restricted_hour_until !== undefined) updatePayload.restricted_hour_until = restricted_hour_until || null;

    // Apply scalar update
    const { error } = await supabase
      .from("promotions")
      .update(updatePayload)
      .eq("id", id);

    if (error) return { success: false as const, error: error.message };

    // Update category filters (M2M)
    if (category_ids !== undefined) {
      await supabase.from("promotion_category_filters").delete().eq("promotion_id", id);
      if (category_ids.length > 0) {
        await supabase.from("promotion_category_filters").insert(
          category_ids.map((cid) => ({ promotion_id: id, category_id: cid }))
        );
      }
    }

    // Update tag filters (M2M)
    if (tag_ids !== undefined) {
      await supabase.from("promotion_tag_filters").delete().eq("promotion_id", id);
      if (tag_ids.length > 0) {
        await supabase.from("promotion_tag_filters").insert(
          tag_ids.map((tid) => ({ promotion_id: id, tag_id: tid }))
        );
      }
    }

    // Update branch filters (M2M)
    if (branch_ids !== undefined) {
      await supabase.from("promotion_branch_filters").delete().eq("promotion_id", id);
      if (branch_ids.length > 0) {
        await supabase.from("promotion_branch_filters").insert(
          branch_ids.map((bid) => ({ promotion_id: id, branch_id: bid }))
        );
      }
    }

    void notifyModuleAction({
      tenantId,
      actorId: userId,
      moduleCodes: ["inventario.promociones"],
      title: "Promoción actualizada",
      message: `Se actualizó la promoción "${current.name}" (${current.code}).`,
      resourceType: "promotion",
      resourceId: id,
      type: "info",
    }).catch((e) => console.error("[updatePromotion] notify error:", e));

    revalidatePath("/inventario/promociones");
    revalidatePath(`/inventario/promociones/${id}`);
    return { success: true as const };
  } catch (err) {
    console.error("[updatePromotion] unexpected error:", err);
    return { success: false as const, error: err instanceof Error ? err.message : "Error inesperado al editar promoción" };
  }
}

// ---------------------------------------------------------------------------
// Delete promotion (direct)
// ---------------------------------------------------------------------------
export async function deletePromotion(id: string) {
  try {
    const { supabase, tenantId, userId } = await requirePermission("inventario.promociones", "delete");

    // Get promotion info
    const { data: promo } = await supabase
      .from("promotions")
      .select("name, code")
      .eq("id", id)
      .single();
    if (!promo) return { success: false as const, error: "Promoción no encontrada" };

    // Soft-delete: mark as inactive so POI Fact sync picks it up and hides it
    const { error } = await supabase
      .from("promotions")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return { success: false as const, error: error.message };

    void notifyModuleAction({
      tenantId,
      actorId: userId,
      moduleCodes: ["inventario.promociones"],
      title: "Promoción eliminada",
      message: `Se eliminó la promoción "${promo.name}" (${promo.code}).`,
      resourceType: "promotion",
      resourceId: id,
      type: "info",
    }).catch((e) => console.error("[deletePromotion] notify error:", e));

    revalidatePath("/inventario/promociones");
    return { success: true as const, message: "Promoción eliminada exitosamente." };
  } catch (err) {
    console.error("[deletePromotion] unexpected error:", err);
    return { success: false as const, error: err instanceof Error ? err.message : "Error inesperado al eliminar promoción" };
  }
}
