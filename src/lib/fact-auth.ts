import { createAdminClient } from "@/lib/supabase/admin";
import { jwtVerify } from "jose";

export interface FactContext {
  tenantId: string;
  userId: string;
  userName: string;
  cargo: string | null;
  /**
   * Identidad de la instalación que hace la petición (`X-POI-Device-Id`).
   *
   * Nullable a propósito: un POS que todavía no se ha actualizado no lo manda, y
   * la sincronización tiene que seguir funcionando. Todo lo que dependa de él
   * debe degradar, no fallar.
   */
  deviceId: string | null;
}

/**
 * Validates the Authorization header (Bearer JWT) from a POI Fact request.
 * Verifies JWT locally first (fast, ~1ms) using SUPABASE_JWT_SECRET.
 * Falls back to Supabase auth.getUser() only if local verification fails.
 */
export async function validateFactUser(
  request: Request,
): Promise<FactContext> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization token");
  }

  const token = authHeader.slice(7);
  let userId: string | null = null;

  // 1. Verify JWT locally (covers both Supabase-issued and custom PIN tokens)
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    try {
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);
      if (payload.sub) {
        userId = payload.sub;
      }
    } catch {
      // Token invalid or expired locally — try Supabase as fallback
    }
  }

  // 2. Fallback: Supabase auth.getUser() (only if local verification failed)
  if (!userId) {
    const adminClient = createAdminClient();
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(token);

    if (!authError && user) {
      userId = user.id;
    }
  }

  if (!userId) {
    throw new Error("Invalid or expired token");
  }

  // Get the user's profile and verify they are active
  const adminClient = createAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("tenant_id, full_name, cargo, is_active")
    .eq("id", userId)
    .single();

  if (profileError || !profile?.tenant_id) {
    throw new Error("User profile not found or missing tenant");
  }

  if (!profile.is_active) {
    throw new Error("User is not authorized for POI Fact");
  }

  return {
    tenantId: profile.tenant_id,
    userId,
    userName: profile.full_name,
    cargo: profile.cargo || null,
    deviceId: request.headers.get("X-POI-Device-Id") || null,
  };
}
