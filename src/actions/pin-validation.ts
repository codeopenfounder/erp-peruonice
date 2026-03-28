"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth/check-permission";

interface PinValidationResult {
  valid: boolean;
  user_id?: string;
  user_name?: string;
  cargo?: string;
  error?: string;
}

export async function validatePinAction(pin: string): Promise<PinValidationResult> {
  if (!pin || !/^\d{4}$/.test(pin)) {
    return { valid: false, error: "PIN invalido" };
  }

  const { tenantId } = await getAuthContext();
  const adminClient = createAdminClient();

  const { data: assignment } = await adminClient
    .from("fact_user_assignments")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("pin_code", pin)
    .eq("is_active", true)
    .single();

  if (!assignment) {
    return { valid: false, error: "PIN no encontrado" };
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, full_name, cargo")
    .eq("id", assignment.user_id)
    .eq("is_active", true)
    .single();

  if (!profile) {
    return { valid: false, error: "Usuario inactivo" };
  }

  return {
    valid: true,
    user_id: profile.id,
    user_name: profile.full_name,
    cargo: profile.cargo,
  };
}
