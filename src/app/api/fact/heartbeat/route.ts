import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactUser } from "@/lib/fact-auth";
import { createCierreArqueo } from "@/actions/arqueos";

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
        await adminClient.from("cash_register_openings").upsert(
          {
            id: body.opening_id,
            tenant_id: ctx.tenantId,
            cash_register_id: body.cash_register_id,
            opened_by: ctx.userId,
            opening_amount: body.opening_amount ?? 0,
            deposit_amount: body.deposit_amount ?? 0,
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

        // Auto-generate cierre arqueo (fire-and-forget)
        createCierreArqueo({
          tenantId: ctx.tenantId,
          cashRegisterId: body.cash_register_id,
          openingId: body.opening_id,
          openedBy: ctx.userId,
          closedBy: body.closed_by || ctx.userId,
          closedByName: body.closed_by_name || null,
          openingAmount: body.opening_amount ?? 0,
          closingAmount: body.closing_amount,
          expectedAmount: body.expected_amount ?? 0,
          difference: body.difference ?? 0,
          notes: body.notes || null,
          denominationCounts: body.denomination_counts || {},
        }).catch(() => {}); // Best-effort, don't block heartbeat response
      } else if (body.opening_id) {
        // Register is open — upsert opening record
        await adminClient.from("cash_register_openings").upsert(
          {
            id: body.opening_id,
            tenant_id: ctx.tenantId,
            cash_register_id: body.cash_register_id,
            opened_by: ctx.userId,
            opening_amount: body.opening_amount ?? 0,
            deposit_amount: body.deposit_amount ?? 0,
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

    // Tenant-wide config to send back to the POS (cached in stored_config locally)
    const adminClient = createAdminClient();
    const { data: factConfig } = await adminClient
      .from("fact_config")
      .select("detraction_account")
      .eq("tenant_id", ctx.tenantId)
      .eq("is_active", true)
      .single();

    return NextResponse.json({
      success: true,
      user_id: ctx.userId,
      server_time: new Date().toISOString(),
      detraction_account: factConfig?.detraction_account || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
