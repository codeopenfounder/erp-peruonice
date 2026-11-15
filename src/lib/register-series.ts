/**
 * Qué series de boleta y factura se le dan a una caja recién creada.
 *
 * Antes se derivaban sólo del código de la caja (CAJA-02 → B002/F002) y se
 * insertaban a ciegas. Al borrar cajas, sus series se quedan sin caja pero
 * siguen existiendo, así que el 2026-11-14 crear «CAJA 2» chocó con la B002
 * que ya existía (`idx_invoice_series_tenant_code`) y la caja se quedó sin
 * series propias. Ahora se busca, desde el número que sugiere el código, la
 * primera serie que esté libre: una que no exista (se crea) o una que exista
 * sin caja y activa (se reutiliza y conserva su correlativo).
 */

/**
 * Series que nunca se dan a una caja. Symple POS, el sistema anterior a POI,
 * emitió con la B001 al menos hasta la B001-00022806 (07/08/2026). Cada número
 * que POI emite en esa serie ya existe en SUNAT y vuelve rechazado con 1033
 * («registrado previamente con otros datos»). Se asume lo mismo de la F001.
 */
export const RETIRED_SERIES: ReadonlySet<string> = new Set(["B001", "F001"]);

export interface ExistingSeries {
  id: string;
  series_code: string;
  document_type: string;
  cash_register_id: string | null;
  is_active: boolean | null;
}

export type SeriesPick =
  | { action: "create"; code: string }
  | { action: "reuse"; code: string; id: string };

const PREFIX: Record<"boleta" | "factura", "B" | "F"> = { boleta: "B", factura: "F" };

/** CAJA-03 → 3. `null` si el código no tiene la forma CAJA-NN. */
export function registerNumber(registerCode: string): number | null {
  const match = registerCode.match(/^CAJA-(\d+)$/);
  return match ? Number(match[1]) : null;
}

/**
 * Primera serie libre de `documentType` a partir de `startNumber`.
 * `existing` son todas las series del tenant (el código es único por tenant).
 * Devuelve `null` si no queda ninguna entre 001 y 999.
 */
export function pickRegisterSeries(
  documentType: "boleta" | "factura",
  startNumber: number,
  existing: ExistingSeries[],
): SeriesPick | null {
  const byCode = new Map(existing.map((s) => [s.series_code, s]));
  const prefix = PREFIX[documentType];

  for (let n = Math.max(1, startNumber); n <= 999; n++) {
    const code = `${prefix}${String(n).padStart(3, "0")}`;
    if (RETIRED_SERIES.has(code)) continue;

    const series = byCode.get(code);
    if (!series) return { action: "create", code };
    if (
      series.cash_register_id === null &&
      series.is_active &&
      series.document_type === documentType
    ) {
      return { action: "reuse", code, id: series.id };
    }
  }

  return null;
}
