import { createAdminClient } from "@/lib/supabase/admin";

interface StockEvent {
  type: "product_upsert" | "product_delete" | "stock_update";
  product_id: string;
  data?: Record<string, unknown>;
  stock_quantity?: number;
  source?: string;
}

export async function broadcastProductChange(
  tenantId: string,
  event: StockEvent,
) {
  try {
    const admin = createAdminClient();
    const channel = admin.channel(`stock-sync:${tenantId}`);
    await channel.send({
      type: "broadcast",
      event: "product_change",
      payload: event,
    });
    admin.removeChannel(channel);
  } catch {
    // Broadcast failure is non-critical — POS will sync on next pull
  }
}

export async function broadcastAssignmentsChange(tenantId: string) {
  try {
    const admin = createAdminClient();
    const channel = admin.channel(`stock-sync:${tenantId}`);
    await channel.send({
      type: "broadcast",
      event: "product_change",
      payload: { type: "assignments_changed" },
    });
    admin.removeChannel(channel);
  } catch {
    // Non-critical — POS will sync on next auto-pull
  }
}

export async function broadcastBatchStockUpdate(
  tenantId: string,
  updates: { product_id: string; stock_quantity: number }[],
  source?: string,
) {
  if (updates.length === 0) return;
  try {
    const admin = createAdminClient();
    const channel = admin.channel(`stock-sync:${tenantId}`);
    await channel.send({
      type: "broadcast",
      event: "product_change",
      payload: {
        type: "batch_stock_update",
        updates,
        source,
      },
    });
    admin.removeChannel(channel);
  } catch {
    // Non-critical
  }
}
