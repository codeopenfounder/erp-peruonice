import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignJWT } from "jose";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pin } = body;

    if (!pin) {
      return NextResponse.json(
        { success: false, error: "PIN requerido" },
        { status: 400 },
      );
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: "PIN inválido" },
        { status: 401 },
      );
    }

    const adminClient = createAdminClient();

    // Look up user by PIN in fact_user_assignments
    const { data: assignment, error: assignError } = await adminClient
      .from("fact_user_assignments")
      .select("user_id, cash_register_id, tenant_id")
      .eq("pin_code", pin)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (assignError || !assignment) {
      return NextResponse.json(
        { success: false, error: "PIN inválido" },
        { status: 401 },
      );
    }

    const effectiveTenantId = assignment.tenant_id;

    // Get profile details for the matched user
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name, email, cargo, tenant_id")
      .eq("id", assignment.user_id)
      .eq("is_active", true)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "PIN inválido" },
        { status: 401 },
      );
    }

    // Restrict POI Lector access by cargo
    const LECTOR_ALLOWED_CARGOS = ["gerente", "supervisor", "control_acceso"];
    if (!LECTOR_ALLOWED_CARGOS.includes(profile.cargo || "")) {
      return NextResponse.json(
        { success: false, error: "Tu cargo no tiene acceso a POI Lector" },
        { status: 403 },
      );
    }

    const userId = profile.id;

    // Generate JWT
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 },
      );
    }

    const secret = new TextEncoder().encode(jwtSecret);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      email: profile.email,
      iss: "supabase",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now)
      .setExpirationTime(now + 28800) // 8 hours
      .sign(secret);

    // Check lector assignment — user must be explicitly assigned to use the lector
    const { data: lectorAssign } = await adminClient
      .from("lector_user_assignments")
      .select("branch_id, branches!inner(id, name)")
      .eq("user_id", userId)
      .eq("tenant_id", effectiveTenantId)
      .eq("is_active", true)
      .single();

    if (!lectorAssign) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso al lector. Contacta al administrador." },
        { status: 403 },
      );
    }

    const lectorBranch = lectorAssign.branches as unknown as { id: string; name: string };

    return NextResponse.json({
      success: true,
      data: {
        token: accessToken,
        expires_at: now + 28800,
        user: {
          id: userId,
          name: profile.full_name,
          tenant_id: effectiveTenantId,
          branch_id: lectorBranch.id,
          branch_name: lectorBranch.name,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
