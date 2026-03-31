"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/check-permission";
import { revalidatePath } from "next/cache";
import type {
  PaymentLinkListItem,
  PaymentLinkDetail,
  PaymentLinkFilters,
  PaymentLinkKPIs,
} from "@/types/payment-link";

const PAGE_SIZE = 50;

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
  if (!profile?.tenant_id) throw new Error("Sin tenant");
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
export async function getPaymentLinkKPIs(): Promise<PaymentLinkKPIs> {
  const { supabase, tenantId } = await getTenantId();
  const monthStart = peruMonthStartUtc();

  const { data: links } = await supabase
    .from("payment_links")
    .select("status, amount, paid_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", monthStart);

  const all = links || [];
  const activeCount = all.filter((l) => l.status === "pending").length;
  const paidLinks = all.filter((l) => l.status === "paid");
  const paidMonth = paidLinks.length;
  const totalCollected = paidLinks.reduce((s, l) => s + Number(l.amount), 0);
  const pendingCount = all.filter((l) => l.status === "pending").length;

  return {
    active_count: activeCount,
    paid_month: paidMonth,
    total_collected_month: Math.round(totalCollected * 100) / 100,
    pending_count: pendingCount,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export async function getPaymentLinks(
  filters: PaymentLinkFilters
): Promise<{ data: PaymentLinkListItem[]; total: number }> {
  const { supabase, tenantId } = await getTenantId();

  let query = supabase
    .from("payment_links")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.date_from)
    query = query.gte("created_at", `${filters.date_from}T05:00:00Z`);
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

  const { data: rows, count } = await query;
  if (!rows || rows.length === 0) return { data: [], total: count ?? 0 };

  // Batch-fetch product names
  const prodIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))];
  let prodMap: Record<string, string> = {};
  if (prodIds.length > 0) {
    const { data: prods } = await supabase
      .from("products")
      .select("id, name")
      .in("id", prodIds);
    if (prods) prodMap = Object.fromEntries(prods.map((p) => [p.id, p.name]));
  }

  // Batch-fetch branch names
  const branchIds = [...new Set(rows.map((r) => r.branch_id).filter(Boolean))];
  let branchMap: Record<string, string> = {};
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);
    if (branches)
      branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
  }

  const data: PaymentLinkListItem[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    amount: Number(r.amount),
    currency: r.currency,
    description: r.description,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    customer_email: r.customer_email,
    product_name: r.product_id ? prodMap[r.product_id] || null : null,
    branch_name: r.branch_id ? branchMap[r.branch_id] || null : null,
    reservation_date: r.reservation_date,
    slot_start: r.slot_start,
    slot_end: r.slot_end,
    quantity: r.quantity,
    culqi_link_url: r.culqi_link_url,
    invoice_id: r.invoice_id,
    paid_at: r.paid_at,
    expires_at: r.expires_at,
    created_at: r.created_at,
  }));

  return { data, total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
export async function getPaymentLinkDetail(
  id: string
): Promise<PaymentLinkDetail | null> {
  const { supabase, tenantId } = await getTenantId();

  const { data: r } = await supabase
    .from("payment_links")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!r) return null;

  let productName: string | null = null;
  if (r.product_id) {
    const { data: prod } = await supabase
      .from("products")
      .select("name")
      .eq("id", r.product_id)
      .single();
    productName = prod?.name || null;
  }

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
    ...r,
    amount: Number(r.amount),
    product_name: productName,
    branch_name: branchName,
  } as PaymentLinkDetail;
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------
export async function cancelPaymentLink(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { tenantId } = await requirePermission("reservas.links", "create");
    const adminClient = createAdminClient();

    const { data: link } = await adminClient
      .from("payment_links")
      .select("status, culqi_link_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (!link) return { success: false, error: "Link no encontrado" };
    if (link.status !== "pending")
      return { success: false, error: "Solo se pueden cancelar links pendientes" };

    await adminClient
      .from("payment_links")
      .update({ status: "cancelled" })
      .eq("id", id);

    revalidatePath("/reservas/links");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
