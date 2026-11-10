import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ReserveCorrelativeInput {
  tenantId: string;
  userId: string;
  seriesId: string;
  openingId?: string | null;
  cashRegisterId?: string | null;
}

export type ReserveCorrelativeResult =
  | { ok: true; correlative: number }
  | { ok: false; error: string };

const UNIQUE_VIOLATION = "23505";

/**
 * Toma el número fiscal de un comprobante que llega del POS.
 *
 * `fn_next_correlative()` es irreversible: el UPDATE del contador queda hecho
 * aunque el INSERT del comprobante falle después, y ese número se pierde. El POS
 * imprime el ticket con el número que calculó en local, así que cada número
 * perdido es un ticket que no coincide con el comprobante ante SUNAT y obliga a
 * reimprimir.
 *
 * Por eso, lo que pueda hacer fallar el INSERT se resuelve ANTES de pedir el
 * número. El caso real (2026-11-09): `invoices.opening_id` es FK a
 * `cash_register_openings`, y una apertura recién hecha en el POS sólo llega al
 * servidor con el heartbeat (cada 2 min). La primera venta tras abrir caja
 * fallaba por la FK, consumía un número, el POS reintentaba 30 s después y la
 * venta salía con el siguiente: el ticket decía 00000001 y SUNAT recibía el
 * 00000002.
 *
 * Si la apertura no se puede crear, no se pide el número: el INSERT fallaría
 * igual y el POS lo reintentará en el siguiente push sin haber quemado ninguno.
 */
export async function reserveInvoiceCorrelative(
  adminClient: AdminClient,
  input: ReserveCorrelativeInput,
): Promise<ReserveCorrelativeResult> {
  if (input.openingId) {
    const { data: existing } = await adminClient
      .from("cash_register_openings")
      .select("id")
      .eq("id", input.openingId)
      .maybeSingle();

    if (!existing) {
      // Provisional: el heartbeat la completa luego con los montos reales.
      const { error } = await adminClient.from("cash_register_openings").insert({
        id: input.openingId,
        tenant_id: input.tenantId,
        cash_register_id: input.cashRegisterId || null,
        opened_by: input.userId,
        opening_amount: 0,
        status: "open",
      });

      // 23505: otra petición (heartbeat, otro push) la creó entre medias. Sirve.
      if (error && error.code !== UNIQUE_VIOLATION) {
        return {
          ok: false,
          error: `No se pudo registrar la apertura de caja: ${error.message}`,
        };
      }
    }
  }

  const { data, error } = await adminClient.rpc("fn_next_correlative", {
    p_series_id: input.seriesId,
  });

  if (error || data == null) {
    return { ok: false, error: error?.message || "Error obteniendo correlativo" };
  }

  return { ok: true, correlative: data as number };
}
