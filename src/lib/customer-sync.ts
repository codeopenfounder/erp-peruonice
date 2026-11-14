import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Cliente tal como lo manda el POS en `sync/push` (todos los de su SQLite). */
export interface PosCustomer {
  id: string;
  document_type: string;
  document_number: string | null;
  legal_name: string;
  trade_name?: string | null;
  address?: string | null;
  ubigeo?: string | null;
  email?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

export interface SyncPosCustomersResult {
  results: { id: string; success: boolean }[];
  /**
   * Traduce el `customer_id` que trae un comprobante o una reserva del POS:
   * - id local de un cliente cuyo documento ya existía → id del servidor;
   * - id de un cliente que no se pudo guardar → `null`;
   * - cualquier otro → el mismo.
   */
  resolveId: (id: string | null) => string | null;
}

const UNIQUE_VIOLATION = "23505";

/**
 * Guarda los clientes del POS y devuelve cómo enlazar sus ids.
 *
 * El alta rápida del POS (DNI/RUC → consulta → guardar) crea siempre un id
 * nuevo, aunque ese documento ya exista en el servidor. El upsert por `id`
 * choca entonces con `idx_customers_tenant_doc` (tenant, tipo, número). Antes
 * ese error se ignoraba: supabase-js no lanza, devuelve `{ error }`. La venta
 * llegaba con un `customer_id` inexistente y fallaba para siempre con
 * `invoices_customer_id_fkey`. Pasó el 2026-11-14 con la boleta B004-00000001.
 *
 * Ahora el id duplicado se enlaza al cliente que ya existía. Si un cliente no
 * se puede guardar por otro motivo, la venta sube sin `customer_id`: los datos
 * fiscales del cliente viajan en las columnas `customer_*` del comprobante, y
 * una venta que no sube no llega a SUNAT.
 */
export async function syncPosCustomers(
  client: AdminClient,
  tenantId: string,
  customers: PosCustomer[],
): Promise<SyncPosCustomersResult> {
  const results: { id: string; success: boolean }[] = [];
  const serverIdByLocalId = new Map<string, string>();
  const failed = new Set<string>();

  for (const cust of customers) {
    const { error } = await client.from("customers").upsert(
      {
        id: cust.id,
        tenant_id: tenantId,
        document_type: cust.document_type,
        document_number: cust.document_number,
        legal_name: cust.legal_name,
        trade_name: cust.trade_name || null,
        address: cust.address || null,
        ubigeo: cust.ubigeo || null,
        email: cust.email || null,
        phone: cust.phone || null,
        is_active: cust.is_active ?? true,
      },
      { onConflict: "id" },
    );

    if (!error) {
      results.push({ id: cust.id, success: true });
      continue;
    }

    // Sólo se enlaza con un documento real: «sin documento» no identifica a
    // nadie, y enlazarlo sería atribuir la venta a otra persona.
    const hasRealDocument =
      !!cust.document_number?.trim() && cust.document_type !== "sin_documento";

    if (error.code === UNIQUE_VIOLATION && hasRealDocument) {
      const { data: existing } = await client
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("document_type", cust.document_type)
        .eq("document_number", cust.document_number as string)
        .maybeSingle();

      if (existing?.id) {
        serverIdByLocalId.set(cust.id, existing.id);
        results.push({ id: cust.id, success: true });
        continue;
      }
    }

    console.error(`[sync-push] cliente ${cust.id} no se pudo guardar:`, error.message);
    failed.add(cust.id);
    results.push({ id: cust.id, success: false });
  }

  return {
    results,
    resolveId(id) {
      if (!id) return null;
      if (failed.has(id)) return null;
      return serverIdByLocalId.get(id) ?? id;
    },
  };
}
