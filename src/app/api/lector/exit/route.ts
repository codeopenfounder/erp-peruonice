import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jwtVerify } from "jose";

async function validateToken(request: Request) {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
  try {
    const { payload } = await jwtVerify(token, secret);
    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", payload.sub)
      .single();
    return profile
      ? { userId: payload.sub as string, tenantId: profile.tenant_id as string }
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const tokenData = await validateToken(request);
    if (!tokenData) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { access_code, scanned_by, checkout_time } = body;

    if (!access_code) {
      return NextResponse.json(
        { success: false, error: "Codigo de acceso requerido" },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient.rpc("fn_register_exit", {
      p_access_code: access_code,
      p_tenant_id: tokenData.tenantId,
      p_scanned_by: scanned_by || null,
      p_checkout_time: checkout_time || null,
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
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
