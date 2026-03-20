"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { notifyModuleAction } from "./notifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LECTOR_ALLOWED_CARGOS = ["gerente", "supervisor", "control_acceso"];

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
// Types
// ---------------------------------------------------------------------------

export interface LectorUserListItem {
  id: string;
  tenant_id: string;
  user_id: string;
  branch_id: string;
  is_active: boolean;
  created_at: string;
  user_name: string;
  user_email: string;
  cargo: string;
  branch_name: string;
  has_pin: boolean;
}

// ---------------------------------------------------------------------------
// List lector assignments
// ---------------------------------------------------------------------------

export async function getLectorUsers(): Promise<LectorUserListItem[]> {
  await requirePermission("config.poi_lector", "view");
  const { supabase, tenantId } = await getTenantId();

  const { data, error } = await supabase
    .from("lector_user_assignments")
    .select("*, branches!inner(name)")
    .eq("tenant_id", tenantId)
    .order("created_at");

  if (error) throw new Error(error.message);

  const userIds = (data || []).map((d) => d.user_id);
  const userMap: Record<string, { email: string; name: string; cargo: string }> = {};
  const pinMap: Record<string, boolean> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, cargo")
      .in("id", userIds);

    profiles?.forEach((p) => {
      userMap[p.id] = {
        email: p.email ?? "",
        name: p.full_name || p.id,
        cargo: p.cargo ?? "",
      };
    });

    const { data: pins } = await supabase
      .from("fact_user_assignments")
      .select("user_id, pin_code")
      .in("user_id", userIds)
      .eq("tenant_id", tenantId);

    pins?.forEach((p) => {
      pinMap[p.user_id] = !!p.pin_code;
    });
  }

  return (data || []).map((d) => ({
    ...d,
    user_name: userMap[d.user_id]?.name ?? d.user_id,
    user_email: userMap[d.user_id]?.email ?? "",
    cargo: userMap[d.user_id]?.cargo ?? "",
    branch_name: (d.branches as unknown as { name: string })?.name ?? "",
    has_pin: pinMap[d.user_id] ?? false,
  })) as unknown as LectorUserListItem[];
}

// ---------------------------------------------------------------------------
// Create lector assignment
// ---------------------------------------------------------------------------

export async function createLectorAssignment(input: {
  user_id: string;
  branch_id: string;
}) {
  const { supabase, tenantId, userId } = await requirePermission(
    "config.poi_lector",
    "create"
  );

  if (!input.user_id || !input.branch_id) {
    return { success: false as const, error: "Usuario y sede son requeridos" };
  }

  // Validate cargo
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, cargo, is_active")
    .eq("id", input.user_id)
    .single();

  if (!profile || !profile.is_active) {
    return { success: false as const, error: "Usuario no encontrado o inactivo" };
  }

  if (!LECTOR_ALLOWED_CARGOS.includes(profile.cargo ?? "")) {
    return {
      success: false as const,
      error: `El cargo "${profile.cargo}" no puede acceder al lector. Solo: ${LECTOR_ALLOWED_CARGOS.join(", ")}`,
    };
  }

  // Validate user has PIN
  const { data: factAssign } = await supabase
    .from("fact_user_assignments")
    .select("pin_code")
    .eq("user_id", input.user_id)
    .eq("tenant_id", tenantId)
    .single();

  if (!factAssign?.pin_code) {
    return {
      success: false as const,
      error: "El usuario no tiene PIN configurado. Asigne un PIN en Usuarios y Acceso.",
    };
  }

  // Upsert assignment
  const { data: assignment, error } = await supabase
    .from("lector_user_assignments")
    .upsert(
      {
        tenant_id: tenantId,
        user_id: input.user_id,
        branch_id: input.branch_id,
        is_active: true,
      },
      { onConflict: "tenant_id,user_id", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (error) return { success: false as const, error: error.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_lector"],
    title: "Usuario asignado al Lector",
    message: `"${profile.full_name}" asignado al lector QR`,
    resourceType: "lector_user_assignment",
    resourceId: assignment!.id,
    type: "info",
  });

  revalidatePath("/config/poi-lector");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Update lector assignment (change branch)
// ---------------------------------------------------------------------------

export async function updateLectorAssignment(
  id: string,
  input: { branch_id: string }
) {
  const { supabase, tenantId } = await requirePermission(
    "config.poi_lector",
    "edit"
  );

  if (!input.branch_id) {
    return { success: false as const, error: "Sede requerida" };
  }

  const { error } = await supabase
    .from("lector_user_assignments")
    .update({ branch_id: input.branch_id })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/config/poi-lector");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Delete lector assignment
// ---------------------------------------------------------------------------

export async function deleteLectorAssignment(id: string) {
  const { supabase, tenantId, userId } = await requirePermission(
    "config.poi_lector",
    "edit"
  );

  // Get user info for notification
  const { data: assignment } = await supabase
    .from("lector_user_assignments")
    .select("user_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  let userName = id;
  if (assignment) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", assignment.user_id)
      .single();
    userName = profile?.full_name || assignment.user_id;
  }

  const { error } = await supabase
    .from("lector_user_assignments")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { success: false as const, error: error.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_lector"],
    title: "Acceso al Lector revocado",
    message: `Acceso de "${userName}" al lector QR revocado`,
    resourceType: "lector_user_assignment",
    resourceId: id,
    type: "warning",
  });

  revalidatePath("/config/poi-lector");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Get employees eligible for lector assignment
// ---------------------------------------------------------------------------

export async function getEmployeesForLectorAssignment(): Promise<
  { id: string; name: string; cargo: string }[]
> {
  const { supabase, tenantId } = await getTenantId();

  // Get all active profiles with allowed cargos
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, cargo")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("cargo", LECTOR_ALLOWED_CARGOS)
    .order("full_name");

  // Get already assigned users
  const { data: assigned } = await supabase
    .from("lector_user_assignments")
    .select("user_id")
    .eq("tenant_id", tenantId);

  const assignedSet = new Set((assigned || []).map((a) => a.user_id));

  // Get users with PINs
  const { data: withPins } = await supabase
    .from("fact_user_assignments")
    .select("user_id, pin_code")
    .eq("tenant_id", tenantId)
    .not("pin_code", "is", null);

  const pinSet = new Set((withPins || []).map((p) => p.user_id));

  return (profiles || [])
    .filter((p) => !assignedSet.has(p.id) && pinSet.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.full_name || p.id,
      cargo: p.cargo ?? "",
    }));
}
