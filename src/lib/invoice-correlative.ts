import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface InsertPosInvoiceInput {
  tenantId: string;
  userId: string;
  openingId?: string | null;
  cashRegisterId?: string | null;
  /** Columnas de `invoices`, sin `correlative_number`: lo asigna la base. */
  invoice: Record<string, unknown>;
  /** Filas de `invoice_items`, cada una con su `invoice_id`. */
  items: Record<string, unknown>[];
}

export type InsertPosInvoiceResult =
  | { ok: true; correlative: number }
  /**
   * Otra petición guardó este mismo comprobante a la vez (dos pushes con el
   * mismo local_id). No es un fallo: el route lo trata como su chequeo de
   * idempotencia, y esa otra petición se encarga del resto del flujo.
   */
  | { ok: false; alreadySaved: true }
  | { ok: false; error: string; alreadySaved?: undefined };

const UNIQUE_VIOLATION = "23505";

/**
 * Guarda un comprobante que llega del POS y le asigna su número fiscal.
 *
 * El número sale de un contador por serie y el POS imprime el ticket con el que
 * calculó en local, así que un número perdido es un ticket que no coincide con el
 * comprobante ante SUNAT. Hasta la migración 00042 el número se pedía en una
 * llamada y el comprobante se guardaba en otras: si el INSERT fallaba, el número
 * ya estaba consumido. Ahora `fn_insert_pos_invoice` hace las dos cosas en una
 * transacción y, si algo falla, el contador vuelve atrás.
 *
 * La apertura de caja se asegura antes, fuera de esa transacción: es idempotente
 * y no consume números. Hace falta porque `invoices.opening_id` es FK y una
 * apertura recién hecha en el POS sólo llega al servidor con el heartbeat (cada
 * 2 min); sin ella, la primera venta tras abrir caja fallaría en cada reintento.
 */
export async function insertPosInvoice(
  adminClient: AdminClient,
  input: InsertPosInvoiceInput,
): Promise<InsertPosInvoiceResult> {
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

  const { data, error } = await adminClient.rpc("fn_insert_pos_invoice", {
    p_invoice: input.invoice,
    p_items: input.items,
  });

  if (error?.code === UNIQUE_VIOLATION && input.invoice.id) {
    const { data: saved } = await adminClient
      .from("invoices")
      .select("id")
      .eq("id", input.invoice.id as string)
      .maybeSingle();
    if (saved) return { ok: false, alreadySaved: true };
  }

  if (error || data == null) {
    return { ok: false, error: error?.message || "Error guardando el comprobante" };
  }

  return { ok: true, correlative: data as number };
}
