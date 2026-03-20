"use server"

import { createClient } from "@/lib/supabase/server"
import type { PermissionAction } from "@/types/auth"

/**
 * Server-side permission check. Throws if the user is not authenticated
 * or lacks the required permission for the given module and action.
 * Owners bypass all permission checks.
 */
export async function requirePermission(
  moduleCode: string,
  action: PermissionAction
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, is_owner")
    .eq("id", user.id)
    .single()

  if (!profile) throw new Error("Perfil no encontrado")

  if (profile.is_owner) {
    return { supabase, tenantId: profile.tenant_id, userId: user.id }
  }

  const { data: perm } = await supabase
    .from("user_permissions")
    .select("can_view, can_create, can_edit, can_delete")
    .eq("user_id", user.id)
    .eq("module_code", moduleCode)
    .single()

  const actionKey = `can_${action}` as const
  const allowed = perm?.[actionKey] ?? false
  if (!allowed) throw new Error("Sin permisos para esta accion")

  return { supabase, tenantId: profile.tenant_id, userId: user.id }
}

/**
 * Server-side auth context helper. Returns the authenticated user's
 * supabase client, tenant ID, user ID, and owner status.
 * Throws if the user is not authenticated or has no profile.
 */
export async function getAuthContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, is_owner")
    .eq("id", user.id)
    .single()

  if (!profile) throw new Error("Perfil no encontrado")

  return {
    supabase,
    tenantId: profile.tenant_id,
    userId: user.id,
    isOwner: profile.is_owner,
  }
}
