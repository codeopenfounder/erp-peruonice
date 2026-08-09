/**
 * Valor referencial de las líneas gratuitas — fuente única.
 *
 * Qué es
 * ------
 * Una línea entregada sin contraprestación no lleva precio, pero SUNAT exige
 * declarar cuánto valía: el **valor referencial unitario**, que va en
 * `cac:AlternativeConditionPrice` con `cbc:PriceTypeCode = "02"` del catálogo 16
 * ("valor referencial unitario en operaciones no onerosas"). Sin él, la operación
 * gratuita no se puede informar.
 *
 * Por qué está aquí
 * -----------------
 * El bloque que lo resolvía estaba escrito **tres veces** —en el push, en el retry
 * manual de `/api/fact/sunat` y en ninguna parte del auto-retry del pull, que era
 * justamente el problema: `autoRetrySunat` no seleccionaba `supply_id`, así que su
 * reenvío mandaba el gratuito sin valor referencial. Tres copias y una divergencia
 * es el patrón que ya produjo el desastre de `note-effects`.
 *
 * De dónde sale el valor, según el tipo de línea
 * ---------------------------------------------
 * | Línea | Valor referencial |
 * |---|---|
 * | Adicional (insumo, `supply_id`) | `supplies.cost_price` — es lo único que hay: `supplies` no tiene precio de venta |
 * | Cortesía (producto regalado, `is_cortesia`) | `invoice_items.original_unit_price` — el precio real que se dejó de cobrar |
 *
 * La cortesía es el caso mejor: el precio que se regaló es exactamente el valor de
 * la operación. El coste del insumo es una aproximación, pero es la única
 * disponible mientras `supplies` no tenga precio de venta.
 *
 * El mínimo de 0.01 no es un capricho: un valor referencial en 0 deja la línea sin
 * base imponible y SUNAT la rechaza.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_REFERENCE_VALUE = 0.01;

/** Lo mínimo que hace falta de un ítem para decidir su valor referencial. */
export interface ReferenceValueSource {
  supply_id?: string | null;
  is_cortesia?: boolean | null;
  original_unit_price?: number | string | null;
  unit_price?: number | string | null;
}

/**
 * Resuelve el valor referencial de todos los insumos de una tanda de ítems en una
 * sola consulta. Devuelve un mapa `supply_id → cost_price`.
 */
export async function buildSupplyCostMap(
  client: SupabaseClient,
  items: ReferenceValueSource[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const supplyIds = [
    ...new Set(items.filter((i) => i.supply_id).map((i) => i.supply_id as string)),
  ];
  if (supplyIds.length === 0) return map;

  const { data, error } = await client
    .from("supplies")
    .select("id, cost_price")
    .in("id", supplyIds);

  if (error) {
    // No se bloquea la emisión por no poder leer un coste: la línea saldrá con el
    // mínimo. Pero se registra, porque una línea gratuita con valor 0.01 en vez de
    // su coste real es un dato fiscal pobre y conviene saber por qué pasó.
    console.error(
      "[reference-values] No se pudo leer el cost_price de los insumos:",
      error.message,
    );
    return map;
  }

  for (const s of data ?? []) {
    map.set(
      s.id as string,
      Math.max(parseFloat(String(s.cost_price)) || 0, MIN_REFERENCE_VALUE),
    );
  }
  return map;
}

/**
 * Valor referencial de un ítem, o `undefined` si la línea no es gratuita.
 *
 * `undefined` y no `0`: el adapter distingue "esta línea no necesita valor
 * referencial" de "vale cero", y lo segundo no es declarable.
 */
export function referenceValueFor(
  item: ReferenceValueSource,
  supplyCostMap: Map<string, number>,
): number | undefined {
  if (item.supply_id) {
    return supplyCostMap.get(item.supply_id) ?? MIN_REFERENCE_VALUE;
  }

  if (item.is_cortesia) {
    const original = parseFloat(String(item.original_unit_price ?? "")) || 0;
    return Math.max(original, MIN_REFERENCE_VALUE);
  }

  return undefined;
}

/**
 * Atajo para los tres puntos de emisión: lee los costes y devuelve una función
 * lista para usar dentro del `.map()` de los ítems.
 */
export async function buildReferenceValueMap(
  client: SupabaseClient,
  items: ReferenceValueSource[],
): Promise<(item: ReferenceValueSource) => number | undefined> {
  const costMap = await buildSupplyCostMap(client, items);
  return (item) => referenceValueFor(item, costMap);
}
