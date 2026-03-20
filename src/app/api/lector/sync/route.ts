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

    const body = await request.json().catch(() => null);

    // Default to today in America/Lima timezone (UTC-5)
    const now = new Date();
    const limaOffset = -5 * 60; // UTC-5
    const limaDate = new Date(
      now.getTime() + (limaOffset - now.getTimezoneOffset()) * 60000,
    );
    const todayStr = limaDate.toISOString().split("T")[0];
    const date = body?.date || todayStr;

    const adminClient = createAdminClient();

    const { data: reservations, error } = await adminClient
      .from("reservations")
      .select(
        `id, access_code, reservation_date, slot_start, slot_end,
         quantity, entries_used, status, checked_in_at, customer_name,
         products(name)`,
      )
      .eq("tenant_id", tokenData.tenantId)
      .eq("reservation_date", date)
      .in("status", ["confirmed", "completed"])
      .not("access_code", "is", null)
      .order("slot_start");

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Flatten the joined product name
    const mapped = (reservations || []).map((r) => {
      const product = r.products as unknown as { name: string } | null;
      return {
        id: r.id,
        access_code: r.access_code,
        reservation_date: r.reservation_date,
        slot_start: r.slot_start,
        slot_end: r.slot_end,
        quantity: r.quantity,
        entries_used: r.entries_used,
        status: r.status,
        checked_in_at: r.checked_in_at,
        customer_name: r.customer_name,
        service_name: product?.name || null,
      };
    });

    return NextResponse.json({ success: true, reservations: mapped });
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
