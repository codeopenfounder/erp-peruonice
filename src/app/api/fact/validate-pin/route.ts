import { NextResponse } from "next/server";
import { validateFactUser } from "@/lib/fact-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const ctx = await validateFactUser(request);
    const body = await request.json();
    const { pin } = body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { valid: false, error: "PIN invalido" },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    // Look up PIN in fact_user_assignments
    const { data: assignment } = await adminClient
      .from("fact_user_assignments")
      .select("user_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("pin_code", pin)
      .eq("is_active", true)
      .single();

    if (!assignment) {
      return NextResponse.json({ valid: false, error: "PIN no encontrado" });
    }

    // Get user profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, full_name, cargo")
      .eq("id", assignment.user_id)
      .eq("is_active", true)
      .single();

    if (!profile) {
      return NextResponse.json({ valid: false, error: "Usuario inactivo" });
    }

    return NextResponse.json({
      valid: true,
      user_id: profile.id,
      user_name: profile.full_name,
      cargo: profile.cargo,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ valid: false, error: message }, { status: 401 });
  }
}
