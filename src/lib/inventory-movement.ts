/**
 * Punto único de escritura de `inventory_movements`.
 *
 * Por qué existe
 * -------------
 * Había **once** INSERT sobre esta tabla que no comprobaban el error, repartidos
 * entre `/api/fact/sync/push` (3), `/api/fact/sunat` (3) y cuatro server actions
 * (`inventory-audits`, `products` ×2, `supplies` ×2). Y `branch_id` es `NOT NULL`
 * (00001:508) mientras que la sede se resuelve por una cadena de fallbacks que
 * puede acabar en `null`.
 *
 * La combinación es el peor modo de fallo posible: PostgREST rechaza el INSERT con
 * `23502`, nadie mira el error, **el movimiento se pierde en silencio** y el stock
 * sí se mueve (va por RPC aparte). O sea, el saldo cambia y el kardex no lo
 * explica. En el camino de anulación —el que más necesita traza fiscal— pasaba con
 * cualquier comprobante sin caja, como un pago de Culqi: `voidBranchId` no tenía
 * ni fallback.
 *
 * Este módulo resuelve la sede con la cadena completa, **falla de forma legible**
 * si no hay ninguna, y devuelve el error en vez de tragárselo. No lanza: los
 * llamadores tienen respuestas muy distintas y ninguna es "reventar".
 * Una emisión ya tiene correlativo y ya está insertada cuando se llega aquí —es un
 * acto fiscal consumado— así que ahí el fallo se acumula como aviso; en una server
 * action se devuelve como `{ success: false }`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase de cualquiera de los tres sabores: el de server actions
 * (`lib/supabase/server`), el admin (`lib/supabase/admin`) y el de navegador.
 * Ninguno pasa genéricos, así que el tipo por defecto los cubre a los tres.
 */
type AnyClient = SupabaseClient;

export interface InventoryMovementInput {
  tenant_id: string;
  entity_type: "product" | "supply";
  entity_id: string;
  quantity: number;
  movement_type: string;
  branch_id: string | null | undefined;
  reason?: string | null;
  notes?: string | null;
  invoice_id?: string | null;
  supplier_ruc?: string | null;
  invoice_code?: string | null;
  created_by?: string | null;
}

/**
 * Pistas para resolver la sede cuando el llamador no la tiene a mano. Se prueban
 * en este orden, que es el que ya usaba `push/route.ts:214-249`:
 *   1. la sede de la caja del comprobante,
 *   2. la sede de la caja asignada al usuario,
 *   3. la única (o primera) sede del tenant.
 */
export interface BranchHints {
  cashRegisterId?: string | null;
  userId?: string | null;
}

/**
 * Caché por petición. Lo aporta quien llama a propósito: a nivel de módulo
 * sobreviviría entre invocaciones en una instancia caliente de Vercel y serviría
 * una sede obsoleta si la caja cambiara de local. Mismo criterio que
 * `resolveBranchOfRegister` en el push.
 */
export type BranchCache = Map<string, string | null>;

export function createBranchCache(): BranchCache {
  return new Map();
}

async function branchOfRegister(
  client: AnyClient,
  cashRegisterId: string,
  cache?: BranchCache,
): Promise<string | null> {
  const key = `register:${cashRegisterId}`;
  if (cache?.has(key)) return cache.get(key) ?? null;
  const { data } = await client
    .from("cash_registers")
    .select("branch_id")
    .eq("id", cashRegisterId)
    .maybeSingle();
  const branchId = (data?.branch_id as string | null) ?? null;
  cache?.set(key, branchId);
  return branchId;
}

/**
 * Resuelve la sede de un movimiento. Devuelve `null` sólo cuando el tenant no
 * tiene ni una sede, que es una base mal sembrada y no un caso operativo.
 */
export async function resolveMovementBranchId(
  client: AnyClient,
  tenantId: string,
  hints: BranchHints = {},
  cache?: BranchCache,
): Promise<string | null> {
  if (hints.cashRegisterId) {
    const fromRegister = await branchOfRegister(client, hints.cashRegisterId, cache);
    if (fromRegister) return fromRegister;
  }

  if (hints.userId) {
    const key = `user:${hints.userId}`;
    if (cache?.has(key)) {
      const cached = cache.get(key) ?? null;
      if (cached) return cached;
    } else {
      const { data: assignment } = await client
        .from("fact_user_assignments")
        .select("cash_register_id")
        .eq("user_id", hints.userId)
        .eq("is_active", true)
        .maybeSingle();
      const registerId = assignment?.cash_register_id as string | null | undefined;
      const fromAssignment = registerId
        ? await branchOfRegister(client, registerId, cache)
        : null;
      cache?.set(key, fromAssignment);
      if (fromAssignment) return fromAssignment;
    }
  }

  const key = `tenant:${tenantId}`;
  if (cache?.has(key)) return cache.get(key) ?? null;
  // `is_main` primero y luego la más antigua: determinista. Los llamadores viejos
  // hacían `.limit(1)` sin orden, así que con dos sedes la sede del movimiento
  // dependía del plan de ejecución — el mismo defecto que tenía la selección de
  // serie del webhook de Culqi.
  const { data: branch } = await client
    .from("branches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const fallback = (branch?.id as string | null) ?? null;
  cache?.set(key, fallback);
  return fallback;
}

export interface MovementResult {
  /** `null` si se insertó. Mensaje legible en castellano si no. */
  error: string | null;
}

/**
 * Inserta un movimiento de inventario comprobando el error, y resolviendo la sede
 * cuando el llamador no la trae.
 *
 * Nunca lanza. El error vuelve como texto para que el llamador decida: avisar
 * (emisión ya consumada) o abortar (server action).
 */
export async function insertInventoryMovement(
  client: AnyClient,
  movement: InventoryMovementInput,
  hints: BranchHints = {},
  cache?: BranchCache,
): Promise<MovementResult> {
  let branchId = movement.branch_id ?? null;

  if (!branchId) {
    branchId = await resolveMovementBranchId(client, movement.tenant_id, hints, cache);
  }

  if (!branchId) {
    // Antes esto era un 23502 silencioso. Ahora dice qué falta y por qué.
    return {
      error:
        `No se pudo registrar el movimiento de inventario de ${movement.entity_type} ` +
        `${movement.entity_id}: no hay ninguna sede a la que atribuirlo ` +
        `(inventory_movements.branch_id es obligatorio). Revisa que el tenant tenga al menos una sede.`,
    };
  }

  const { error } = await client.from("inventory_movements").insert({
    tenant_id: movement.tenant_id,
    entity_type: movement.entity_type,
    entity_id: movement.entity_id,
    quantity: movement.quantity,
    movement_type: movement.movement_type,
    reason: movement.reason ?? null,
    notes: movement.notes ?? null,
    branch_id: branchId,
    invoice_id: movement.invoice_id ?? null,
    supplier_ruc: movement.supplier_ruc ?? null,
    invoice_code: movement.invoice_code ?? null,
    created_by: movement.created_by ?? null,
  });

  if (error) {
    console.error(
      `[inventory-movement] INSERT falló (${movement.movement_type}, ${movement.entity_type} ${movement.entity_id}):`,
      error.message,
    );
    return {
      error: `No se pudo registrar el movimiento de inventario: ${error.message}`,
    };
  }

  return { error: null };
}
