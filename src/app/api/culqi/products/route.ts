import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (!profile?.tenant_id) {
      return NextResponse.json({ error: "Sin tenant" }, { status: 403 });
    }

    const url = new URL(request.url);
    const branchId = url.searchParams.get("branch_id");

    // Get schedulable products (services) for this branch
    // A product is schedulable if it has a service_schedule for this branch
    let query = supabase
      .from("products")
      .select("id, name, sale_price, type, is_schedulable")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true)
      .eq("is_schedulable", true)
      .order("name");

    const { data: products, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If branch_id provided, filter to only products with a schedule in that branch
    let filtered = products || [];
    if (branchId && filtered.length > 0) {
      const productIds = filtered.map((p) => p.id);
      const { data: schedules } = await supabase
        .from("service_schedules")
        .select("product_id")
        .in("product_id", productIds)
        .eq("branch_id", branchId)
        .eq("is_active", true);

      if (schedules) {
        const scheduleProductIds = new Set(schedules.map((s) => s.product_id));
        filtered = filtered.filter((p) => scheduleProductIds.has(p.id));
      }
    }

    return NextResponse.json({
      products: filtered.map((p) => ({
        id: p.id,
        name: p.name,
        sale_price: Number(p.sale_price),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}
