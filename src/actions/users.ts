"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, getAuthContext } from "@/lib/auth/check-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createUserSchema,
  updateUserSchema,
  updatePermissionsSchema,
} from "@/lib/validators/user";
import { notifyModuleAction, getActorName } from "./notifications";
import type { ModulePermission } from "@/types/auth";
import type { Cargo } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UserWithPermissions {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone: string | null;
  cargo: Cargo;
  pin_code: string | null;
  is_owner: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  permissions: ModulePermission[];
}

// ---------------------------------------------------------------------------
// Get all users for current tenant
// ---------------------------------------------------------------------------
export async function getUsers(): Promise<UserWithPermissions[]> {
  const { supabase, tenantId } = await getAuthContext();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const users = profiles || [];
  const userIds = users.map((u) => u.id);

  // Batch-fetch permissions for all users
  let permissionsMap: Record<string, ModulePermission[]> = {};
  if (userIds.length > 0) {
    const { data: allPerms } = await supabase
      .from("user_permissions")
      .select("user_id, module_code, can_view, can_create, can_edit, can_delete")
      .in("user_id", userIds);

    (allPerms || []).forEach((p) => {
      if (!permissionsMap[p.user_id]) permissionsMap[p.user_id] = [];
      permissionsMap[p.user_id].push({
        module_code: p.module_code,
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
      });
    });
  }

  // Batch-fetch POS assignments (pin_code) from fact_user_assignments
  let pinMap: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: assignments } = await supabase
      .from("fact_user_assignments")
      .select("user_id, pin_code")
      .in("user_id", userIds);
    (assignments || []).forEach((a) => {
      pinMap[a.user_id] = a.pin_code || null;
    });
  }

  return users.map((u) => ({
    ...u,
    cargo: (u.cargo as Cargo) || "cajero",
    pin_code: pinMap[u.id] || null,
    permissions: permissionsMap[u.id] || [],
  }));
}

// ---------------------------------------------------------------------------
// Create user
// ---------------------------------------------------------------------------
export async function createUser(input: unknown) {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase, tenantId, userId } = await requirePermission(
    "config.usuarios",
    "create",
  );

  const { first_name, last_name, cargo, pin_code } = parsed.data;

  // Validate PIN uniqueness within the tenant (check fact_user_assignments)
  const admin = createAdminClient();
  const { count: pinCount, error: pinCheckError } = await admin
    .from("fact_user_assignments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("pin_code", pin_code)
    .eq("is_active", true);

  if (pinCheckError) {
    return { success: false as const, error: pinCheckError.message };
  }

  if (pinCount && pinCount > 0) {
    return {
      success: false as const,
      error: "Este PIN ya esta en uso por otro usuario",
    };
  }

  let newUserId: string;

  const needsWebAuth = cargo === "gerente" || cargo === "supervisor";

  if (needsWebAuth) {
    // Web users: need a real email + password
    const { email, password } = parsed.data as { email: string; password: string };

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name, last_name },
      });

    if (authError) {
      if (authError.message.includes("already been registered")) {
        return {
          success: false as const,
          error: "Este email ya esta registrado",
        };
      }
      return { success: false as const, error: authError.message };
    }

    newUserId = authData.user.id;
  } else {
    // Cajero / Control Acceso: no real email, create a placeholder auth user
    const placeholderEmail = `pin-${pin_code}-${Date.now()}@poi.internal`;

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: placeholderEmail,
        password: crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { first_name, last_name },
      });

    if (authError) {
      return { success: false as const, error: authError.message };
    }

    newUserId = authData.user.id;
  }

  // Update profile with tenant_id, cargo, and names
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      tenant_id: tenantId,
      first_name,
      last_name,
      cargo,
    })
    .eq("id", newUserId);

  if (profileError) {
    return { success: false as const, error: profileError.message };
  }

  // Create POS assignment with PIN in fact_user_assignments
  const { error: assignError } = await admin
    .from("fact_user_assignments")
    .upsert({
      tenant_id: tenantId,
      user_id: newUserId,
      pin_code,
      is_active: true,
    }, { onConflict: "tenant_id,user_id" });

  if (assignError) {
    return { success: false as const, error: assignError.message };
  }

  // Notify
  const actorName = await getActorName(supabase, userId);
  const cargoLabels: Record<string, string> = {
    gerente: "Gerente",
    supervisor: "Supervisor",
    cajero: "Cajero",
    control_acceso: "Control Acceso",
  };
  const cargoLabel = cargoLabels[cargo] || cargo;
  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.usuarios"],
    title: "Nuevo usuario creado",
    message: `${actorName} creo el usuario "${first_name} ${last_name}" (${cargoLabel})`,
    type: "success",
  }).catch(console.error);

  revalidatePath("/config/usuarios");
  return { success: true as const, userId: newUserId };
}

// ---------------------------------------------------------------------------
// Update user name
// ---------------------------------------------------------------------------
export async function updateUser(userId: string, input: unknown) {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase } = await requirePermission("config.usuarios", "edit");

  const { first_name, last_name } = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({ first_name, last_name })
    .eq("id", userId);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/config/usuarios");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Update user permissions (upsert)
// ---------------------------------------------------------------------------
export async function updateUserPermissions(
  targetUserId: string,
  permissions: unknown,
) {
  const parsed = updatePermissionsSchema.safeParse(permissions);
  if (!parsed.success) {
    return { success: false as const, error: "Permisos invalidos" };
  }

  const { supabase, tenantId, userId } = await requirePermission(
    "config.usuarios",
    "edit",
  );

  // Delete existing permissions for this user
  const { error: deleteError } = await supabase
    .from("user_permissions")
    .delete()
    .eq("user_id", targetUserId);

  if (deleteError) return { success: false as const, error: deleteError.message };

  // Insert new permissions (only those with at least one true action)
  const rows = parsed.data
    .filter((p) => p.can_view || p.can_create || p.can_edit || p.can_delete)
    .map((p) => ({
      tenant_id: tenantId,
      user_id: targetUserId,
      module_code: p.module_code,
      can_view: p.can_view,
      can_create: p.can_create,
      can_edit: p.can_edit,
      can_delete: p.can_delete,
    }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("user_permissions")
      .insert(rows);

    if (insertError) return { success: false as const, error: insertError.message };
  }

  // Get target user name for notification
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", targetUserId)
    .single();

  const targetName = targetProfile
    ? `${targetProfile.first_name} ${targetProfile.last_name}`.trim()
    : "un usuario";

  const actorName = await getActorName(supabase, userId);
  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.usuarios"],
    title: "Permisos actualizados",
    message: `${actorName} actualizo los permisos de ${targetName}`,
    type: "info",
  }).catch(console.error);

  revalidatePath("/config/usuarios");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Toggle user active status
// ---------------------------------------------------------------------------
export async function toggleUserActive(targetUserId: string) {
  const { supabase, tenantId, userId } = await requirePermission(
    "config.usuarios",
    "edit",
  );

  // Get current state
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, is_owner, first_name, last_name")
    .eq("id", targetUserId)
    .single();

  if (!profile) return { success: false as const, error: "Usuario no encontrado" };
  if (profile.is_owner) {
    return { success: false as const, error: "No se puede desactivar al propietario" };
  }

  const newState = !profile.is_active;
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: newState })
    .eq("id", targetUserId);

  if (error) return { success: false as const, error: error.message };

  const actorName = await getActorName(supabase, userId);
  const targetName = `${profile.first_name} ${profile.last_name}`.trim();
  const stateLabel = newState ? "activado" : "desactivado";

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.usuarios"],
    title: `Usuario ${stateLabel}`,
    message: `${actorName} ${stateLabel} al usuario "${targetName}"`,
    type: newState ? "success" : "warning",
  }).catch(console.error);

  revalidatePath("/config/usuarios");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Delete user (owner only)
// ---------------------------------------------------------------------------
export async function deleteUser(targetUserId: string) {
  const { supabase, tenantId, userId } = await getAuthContext();

  // Only owner can delete users
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("is_owner")
    .eq("id", userId)
    .single();

  if (!callerProfile?.is_owner) {
    return { success: false as const, error: "Solo el propietario puede eliminar usuarios" };
  }

  // Get target profile
  const { data: target } = await supabase
    .from("profiles")
    .select("first_name, last_name, is_owner")
    .eq("id", targetUserId)
    .single();

  if (!target) return { success: false as const, error: "Usuario no encontrado" };
  if (target.is_owner) {
    return { success: false as const, error: "No se puede eliminar al propietario" };
  }
  if (targetUserId === userId) {
    return { success: false as const, error: "No puedes eliminarte a ti mismo" };
  }

  // Delete via Supabase admin — cascades to profiles, permissions, assignments, etc.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(targetUserId);
  if (authError) return { success: false as const, error: authError.message };

  const targetName = `${target.first_name} ${target.last_name}`.trim();
  const actorName = await getActorName(supabase, userId);
  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.usuarios"],
    title: "Usuario eliminado",
    message: `${actorName} elimino al usuario "${targetName}"`,
    type: "warning",
  }).catch(console.error);

  revalidatePath("/config/usuarios");
  revalidatePath("/config/poi-fact");
  return { success: true as const, message: `Usuario "${targetName}" eliminado` };
}
