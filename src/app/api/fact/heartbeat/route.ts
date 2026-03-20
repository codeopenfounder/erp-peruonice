import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactUser } from "@/lib/fact-auth";

export async function POST(request: Request) {
  try {
    const ctx = await validateFactUser(request);
    const body = await request.json().catch(() => ({}));

    // Sync cash register opening status if provided
    if (body.cash_register_id) {
      const adminClient = createAdminClient();
      const isClosing = body.closing_amount != null;

      if (body.opening_id && isClosing) {
        // Closing with opening_id — create-and-close in one step
        // Handles case where opening was never synced (app restarted before heartbeat)
        await adminClient.from("cash_register_openings").upsert(
          {
            id: body.opening_id,
            tenant_id: ctx.tenantId,
            cash_register_id: body.cash_register_id,
            opened_by: ctx.userId,
            opening_amount: body.opening_amount ?? 0,
            status: "closed",
            closed_at: new Date().toISOString(),
            closed_by: body.closed_by || ctx.userId,
            closing_amount: body.closing_amount,
            expected_amount: body.expected_amount,
            difference: body.difference,
            notes: body.notes || null,
          },
          { onConflict: "id" },
        );

        await adminClient
          .from("cash_registers")
          .update({ current_opening_id: null })
          .eq("id", body.cash_register_id);
      } else if (body.opening_id) {
        // Register is open — upsert opening record
        await adminClient.from("cash_register_openings").upsert(
          {
            id: body.opening_id,
            tenant_id: ctx.tenantId,
            cash_register_id: body.cash_register_id,
            opened_by: ctx.userId,
            opening_amount: body.opening_amount ?? 0,
            status: "open",
          },
          { onConflict: "id" },
        );

        // Point register to current opening
        await adminClient
          .from("cash_registers")
          .update({ current_opening_id: body.opening_id })
          .eq("id", body.cash_register_id);
      } else {
        // No opening_id — just clear register reference
        await adminClient
          .from("cash_registers")
          .update({ current_opening_id: null })
          .eq("id", body.cash_register_id);
      }
    }

    return NextResponse.json({
      success: true,
      user_id: ctx.userId,
      server_time: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
