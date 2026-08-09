import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Canal de tiempo real hacia los POS: `stock-sync:{tenantId}`, evento
 * `product_change`.
 *
 * `source` identifica al emisor para que el receptor descarte su propio eco. Es
 * el **device_id** de la instalación que originó el cambio, o el centinela
 * `"erp"` cuando el cambio viene del panel web. Antes era el `user_id`, así que
 * dos cajas logueadas con el mismo PIN se ignoraban mutuamente para siempre.
 *
 * Un fallo de broadcast nunca puede tumbar la mutación que lo originó: el POS
 * converge igual en el siguiente pull (≤2 min). Pero sí se registra, porque un
 * canal roto en silencio es exactamente cómo estos eventos llevaban meses sin
 * llegar a nadie.
 */

/** Centinela de `source` para todo lo que se origina en el ERP web. */
export const ERP_SOURCE = "erp";

export type StockEvent =
  | {
      type: "product_upsert";
      product_id: string;
      data: Record<string, unknown>;
      source?: string;
    }
  | { type: "product_delete"; product_id: string; source?: string }
  | {
      type: "stock_update";
      product_id: string;
      stock_quantity: number;
      source?: string;
    }
  | {
      type: "supply_stock_update";
      supply_id: string;
      stock_quantity: number;
      source?: string;
    };

async function send(tenantId: string, payload: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    const channel = admin.channel(`stock-sync:${tenantId}`);
    await channel.send({
      type: "broadcast",
      event: "product_change",
      payload,
    });
    admin.removeChannel(channel);
  } catch (err) {
    console.error("[stock-broadcast] No se pudo emitir el evento:", err);
  }
}

export async function broadcastProductChange(
  tenantId: string,
  event: StockEvent,
) {
  await send(tenantId, { source: ERP_SOURCE, ...event });
}

export async function broadcastAssignmentsChange(
  tenantId: string,
  source: string = ERP_SOURCE,
) {
  await send(tenantId, { type: "assignments_changed", source });
}

export async function broadcastBatchStockUpdate(
  tenantId: string,
  updates: { product_id: string; stock_quantity: number }[],
  source?: string,
  supplyUpdates: { supply_id: string; stock_quantity: number }[] = [],
) {
  if (updates.length === 0 && supplyUpdates.length === 0) return;
  await send(tenantId, {
    type: "batch_stock_update",
    updates,
    supply_updates: supplyUpdates,
    source,
  });
}

// ---------------------------------------------------------------------------
// Atajos para las server actions del ERP
// ---------------------------------------------------------------------------
// Hasta ahora `broadcastProductChange` y `broadcastAssignmentsChange` no tenían
// ni un solo llamador: el único emisor vivo era el push del POS. Es decir, nada
// de lo que ocurría en el panel web llegaba a ninguna caja hasta el pull
// siguiente (≤2 min), y el `product_delete` del POS era código inalcanzable.

/**
 * Columnas exactas que el POS espera en un producto. **Tienen que coincidir con
 * el `select` de `/api/fact/sync/pull`**: el evento acaba en el mismo
 * `upsert_products` de SQLite, y una columna de menos deja el campo a NULL.
 */
const POS_PRODUCT_COLUMNS =
  "id, sku, name, description, type, product_kind, unit_price, cost_price, currency, tax_type, igv_rate, stock_quantity, min_stock, unit_of_measure, barcode, branch_id, image_url, is_active, is_schedulable";

/** Relee el producto y lo emite entero. Fire-and-forget desde las actions. */
export async function broadcastProductUpsertById(
  tenantId: string,
  productId: string,
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .select(POS_PRODUCT_COLUMNS)
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) {
    console.error("[stock-broadcast] No se pudo releer el producto:", error?.message);
    return;
  }
  await broadcastProductChange(tenantId, {
    type: "product_upsert",
    product_id: productId,
    data: data as unknown as Record<string, unknown>,
  });
}

export async function broadcastProductDelete(tenantId: string, productId: string) {
  await broadcastProductChange(tenantId, { type: "product_delete", product_id: productId });
}

export async function broadcastStockUpdate(
  tenantId: string,
  productId: string,
  stockQuantity: number,
) {
  await broadcastProductChange(tenantId, {
    type: "stock_update",
    product_id: productId,
    stock_quantity: stockQuantity,
  });
}

export async function broadcastSupplyStockUpdate(
  tenantId: string,
  supplyId: string,
  stockQuantity: number,
) {
  await broadcastProductChange(tenantId, {
    type: "supply_stock_update",
    supply_id: supplyId,
    stock_quantity: stockQuantity,
  });
}
