"use server";

import { createClient } from "@/lib/supabase/server";

const DEFAULTS = {
  theme: "dark" as const,
  font_size: "md" as const,
  locale: "es" as const,
  push_enabled: false,
};

export async function getPreferences() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: DEFAULTS, error: null };

  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    // No row yet — return defaults (row will be created on first save)
    return { data: DEFAULTS, error: null };
  }

  return { data, error: null };
}

export async function updatePreferences(updates: {
  theme?: string;
  font_size?: string;
  locale?: string;
  push_enabled?: boolean;
  quick_access?: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id)
    return { success: false, error: "No tenant" };

  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,
        tenant_id: profile.tenant_id,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,tenant_id" }
    );

  return { success: !error, error: error?.message ?? null };
}
