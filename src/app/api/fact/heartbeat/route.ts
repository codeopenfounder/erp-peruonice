import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFactUser } from "@/lib/fact-auth";
import { createCierreArqueo } from "@/actions/arqueos";

/**
 * Conflicto de terminal sobre una misma caja.
 *
 * La arquitectura es **una caja = un terminal** (ya implícita en la migración
 * 00038: cada caja tiene su serie porque el POS calcula en local el correlativo
 * que imprime). Dos POS sobre la misma caja producen arqueos divergentes que
 * ningún pull reconcilia, porque el saldo, el timeline y el esperado se calculan
 * 100 % contra la SQLite de cada máquina.
 *
 * No se bloquea la venta —es un POS offline-first y bloquear es peor que avisar—,
 * se devuelve el conflicto para que el terminal lo enseñe.
 */
interface DeviceConflict {
  conflict: true;
  holder_device: string | null;
  holder_seen_at: string | null;
}

export async function POST(request: Request) {
  try {
    const ctx = await validateFactUser(request);
    const body = await request.json().catch(() => ({}));
    let deviceConflict: DeviceConflict | null = null;

    // Sync cash register opening status if provided
    if (body.cash_register_id) {
      const adminClient = createAdminClient();
      const isClosing = body.closing_amount != null;

      // Estado de la caja ANTES de tocar nada: es lo que permite distinguir
      // "soy yo quien la tiene" de "la tiene otro".
      const { data: registerBefore } = await adminClient
        .from("cash_registers")
        .select("current_opening_id, active_device_id, active_device_seen_at")
        .eq("id", body.cash_register_id)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();

      if (
        ctx.deviceId &&
        registerBefore?.active_device_id &&
        registerBefore.active_device_id !== ctx.deviceId &&
        registerBefore.current_opening_id &&
        registerBefore.current_opening_id !== body.opening_id
      ) {
        deviceConflict = {
          conflict: true,
          holder_device: registerBefore.active_device_id,
          holder_seen_at: registerBefore.active_device_seen_at ?? null,
        };
        console.warn(
          `[heartbeat] Caja ${body.cash_register_id} reclamada por dos terminales: ` +
            `${registerBefore.active_device_id} y ${ctx.deviceId}`,
        );
      }

      // `probe`: sondeo de sólo lectura que hace el POS ANTES de abrir la caja.
      // No escribe nada — abrir una caja que otro terminal tiene abierta es
      // justamente lo que hay que poder detectar sin provocarlo.
      if (body.probe) {
        return NextResponse.json({
          success: true,
          server_time: new Date().toISOString(),
          device_conflict: deviceConflict,
        });
      }

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
            device_id: ctx.deviceId,
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

        // Sólo se suelta la caja si la apertura que se cierra es la que la caja
        // tenía apuntada. Antes era un UPDATE ciego, así que un terminal cerrando
        // SU caja borraba la apertura viva del otro terminal.
        await adminClient
          .from("cash_registers")
          .update({ current_opening_id: null, active_device_id: null })
          .eq("id", body.cash_register_id)
          .eq("current_opening_id", body.opening_id);

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
            device_id: ctx.deviceId,
            status: "open",
          },
          { onConflict: "id" },
        );

        // La caja se apunta a esta apertura sólo si está libre o ya era la suya.
        // En conflicto gana quien la tenía, no el último heartbeat en llegar: con
        // el UPDATE ciego anterior la columna hacía ping-pong cada 2 minutos.
        await adminClient
          .from("cash_registers")
          .update({
            current_opening_id: body.opening_id,
            active_device_id: ctx.deviceId,
            active_device_seen_at: new Date().toISOString(),
          })
          .eq("id", body.cash_register_id)
          .or(`current_opening_id.is.null,current_opening_id.eq.${body.opening_id}`);
      } else {
        // Sin apertura: se suelta la caja sólo si la tenía este terminal (o si
        // nadie la reclama todavía, que es el estado de toda caja antes de 00040).
        await adminClient
          .from("cash_registers")
          .update({ current_opening_id: null, active_device_id: null })
          .eq("id", body.cash_register_id)
          .or(
            ctx.deviceId
              ? `active_device_id.is.null,active_device_id.eq.${ctx.deviceId}`
              : "active_device_id.is.null",
          );
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
      device_conflict: deviceConflict,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    const status =
      message.includes("token") || message.includes("authorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
