"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Get notifications for current user (cursor-based pagination)
// ---------------------------------------------------------------------------
export async function getNotifications(params?: {
  cursor?: string;
  limit?: number;
  filter?: string; // "all" | "unread"
}) {
  const { cursor, limit = 20, filter = "all" } = params ?? {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: true, data: { data: [], nextCursor: null } };

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt("created_at", cursor);
  if (filter === "unread") query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = data || [];
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return {
    success: true,
    data: {
      data: items,
      nextCursor: hasMore ? items[items.length - 1].created_at : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Get unread notification count
// ---------------------------------------------------------------------------
export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return count || 0;
}

// ---------------------------------------------------------------------------
// Mark notification as read
// ---------------------------------------------------------------------------
export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);

  revalidatePath("/config/notificaciones");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Mark all notifications as read
// ---------------------------------------------------------------------------
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false };

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  revalidatePath("/config/notificaciones");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Internal helper: get all users with given modules + owners
// ---------------------------------------------------------------------------
async function getModuleUsers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  moduleCodes: string[],
): Promise<string[]> {
  const userIds = new Set<string>();

  // Users with view permission on any of the given modules
  const { data: perms } = await supabase
    .from("user_permissions")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("module_code", moduleCodes)
    .eq("can_view", true);
  (perms || []).forEach((p: { user_id: string }) => userIds.add(p.user_id));

  // Owners always get notifications
  const { data: owners } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_owner", true)
    .eq("is_active", true);
  (owners || []).forEach((o: { id: string }) => userIds.add(o.id));

  return [...userIds];
}

// ---------------------------------------------------------------------------
// Internal helper: create notification for a specific user
// ---------------------------------------------------------------------------
export async function createNotification(params: {
  tenantId: string;
  userId: string;
  type: "info" | "warning" | "success" | "error";
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
}) {
  const supabase = await createClient();
  await supabase.from("notifications").insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    resource_type: params.resourceType || null,
    resource_id: params.resourceId || null,
  });
}

// ---------------------------------------------------------------------------
// Helper: get actor display name
// ---------------------------------------------------------------------------
export async function getActorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .single();
  if (!data) return "Un usuario";
  return `${data.first_name} ${data.last_name}`.trim() || "Un usuario";
}

// ---------------------------------------------------------------------------
// Generic: notify all users with given modules about a module action
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Low-stock push notification (called from API routes, not server actions)
// ---------------------------------------------------------------------------
export async function notifyLowStockPush(params: {
  tenantId: string;
  productName: string;
  currentStock: number;
  minStock: number;
  resourceType?: string;
  resourceId?: string;
}) {
  const INVENTORY_MODULES = [
    "inventario.productos",
    "inventario.insumos",
    "inventario.movimientos",
  ];

  await notifyModuleAction({
    tenantId: params.tenantId,
    actorId: "", // system-generated
    moduleCodes: INVENTORY_MODULES,
    title: "Stock bajo",
    message: `"${params.productName}" tiene ${params.currentStock} unidades (minimo: ${params.minStock})`,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    type: "warning",
  });
}

// ---------------------------------------------------------------------------
// Generic: notify all users with given modules about a module action
// ---------------------------------------------------------------------------
export async function notifyModuleAction(params: {
  tenantId: string;
  actorId: string;
  moduleCodes: string[];
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
  type?: "info" | "warning" | "success" | "error";
}) {
  const supabase = await createClient();

  const userIds = await getModuleUsers(supabase, params.tenantId, params.moduleCodes);

  const allUserIds = new Set(userIds);
  allUserIds.add(params.actorId);

  const notifications = [...allUserIds].map((userId) => ({
    tenant_id: params.tenantId,
    user_id: userId,
    type: params.type || "info",
    title: params.title,
    message: params.message,
    resource_type: params.resourceType || null,
    resource_id: params.resourceId || null,
  }));

  if (notifications.length > 0) {
    const { error } = await supabase.from("notifications").insert(notifications);
    if (error) {
      console.error("[notifyModuleAction] insert error:", error);
    }
  }
}
