"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Get current user profile
// ---------------------------------------------------------------------------
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Get permissions
  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("module_code, can_view, can_create, can_edit, can_delete")
    .eq("user_id", user.id);

  return {
    profile,
    permissions: permissions || [],
    lastSignIn: user.last_sign_in_at || null,
  };
}

// ---------------------------------------------------------------------------
// Update profile (name, phone)
// ---------------------------------------------------------------------------
export async function updateProfile(input: {
  first_name?: string;
  last_name?: string;
  phone?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: "No autenticado" };

  const updateData: Record<string, unknown> = {};
  if (input.first_name !== undefined) updateData.first_name = input.first_name;
  if (input.last_name !== undefined) updateData.last_name = input.last_name;
  if (input.phone !== undefined) updateData.phone = input.phone || null;

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", user.id);

  if (error) return { success: false as const, error: error.message };

  revalidatePath("/config/general");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Update password
// ---------------------------------------------------------------------------
export async function updatePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email)
    return { success: false as const, error: "No autenticado" };

  // Verify current password by attempting sign-in
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: input.currentPassword,
  });

  if (signInError) {
    return { success: false as const, error: "La contraseña actual es incorrecta" };
  }

  // Update to new password
  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (updateError) {
    return { success: false as const, error: updateError.message };
  }

  return { success: true as const };
}
