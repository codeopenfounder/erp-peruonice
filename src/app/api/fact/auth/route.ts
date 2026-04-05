import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignJWT } from "jose";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pin, tenant_id } = body;

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
    // If tenant_id is provided, filter by it (faster). Otherwise, search globally (first-time setup).
    const query = adminClient
      .from("fact_user_assignments")
      .select("user_id, cash_register_id, pin_code, tenant_id")
      .eq("pin_code", pin)
      .eq("is_active", true);

    if (tenant_id) {
      query.eq("tenant_id", tenant_id);
    }

    const { data: assignment, error: assignError } = await query
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
      .select("id, email, full_name, cargo, tenant_id")
      .eq("id", assignment.user_id)
      .eq("is_active", true)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "PIN inválido" },
        { status: 401 },
      );
    }

    // Restrict POI Fact access by cargo
    const FACT_ALLOWED_CARGOS = ["gerente", "supervisor", "cajero"];
    if (!FACT_ALLOWED_CARGOS.includes(profile.cargo || "")) {
      return NextResponse.json(
        { success: false, error: "Tu cargo no tiene acceso a POI Fact" },
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

    // Get fact_config for the tenant
    const { data: config } = await adminClient
      .from("fact_config")
      .select(
        "ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, distrito, provider, is_production, logo_url",
      )
      .eq("tenant_id", effectiveTenantId)
      .eq("is_active", true)
      .single();

    // Get branding
    const { data: branding } = await adminClient
      .from("tenant_branding")
      .select("company_name, logo_url, primary_color")
      .eq("tenant_id", effectiveTenantId)
      .single();

    // Get cash register info if assigned
    let cashRegisterInfo: {
      id: string;
      name: string;
      code: string;
      branch_name: string | null;
      branch_id: string | null;
    } | null = null;
    if (assignment.cash_register_id) {
      const { data: cr } = await adminClient
        .from("cash_registers")
        .select("id, name, code, branch_id, branches(id, name)")
        .eq("id", assignment.cash_register_id)
        .single();
      if (cr) {
        const branch = cr.branches as unknown as {
          id: string;
          name: string;
        } | null;
        cashRegisterInfo = {
          id: cr.id,
          name: cr.name,
          code: cr.code,
          branch_name: branch?.name || null,
          branch_id: branch?.id || null,
        };
      }
    }

    // Get assigned series for this cash register
    let assignedSeries: Array<{
      id: string;
      series_code: string;
      document_type: string;
    }> = [];
    if (assignment.cash_register_id) {
      const { data: series } = await adminClient
        .from("invoice_series")
        .select("id, series_code, document_type")
        .eq("cash_register_id", assignment.cash_register_id)
        .eq("is_active", true);
      assignedSeries = series || [];
    }

    return NextResponse.json({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: null,
        expires_at: now + 28800,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        user: {
          id: userId,
          email: profile.email,
          name: profile.full_name,
          cargo: profile.cargo || null,
          cash_register_id: cashRegisterInfo?.id || null,
          cash_register_name: cashRegisterInfo?.name || null,
          cash_register_code: cashRegisterInfo?.code || null,
          branch_name: cashRegisterInfo?.branch_name || null,
          branch_id: cashRegisterInfo?.branch_id || null,
          assigned_series: assignedSeries,
          has_pin: true,
        },
        tenant: {
          id: effectiveTenantId,
          fact_config: config || null,
          branding: branding || null,
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
