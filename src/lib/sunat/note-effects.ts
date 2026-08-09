/**
 * Efectos económicos de las notas de crédito y débito — FUENTE ÚNICA.
 *
 * ⚠️ Este archivo está DUPLICADO A PROPÓSITO en los dos repositorios, en la
 *    MISMA ruta (`src/lib/sunat/note-effects.ts`) y byte a byte idéntico, para
 *    que `@/lib/sunat/note-effects` funcione igual en los dos y el diff entre
 *    ambos sea siempre vacío. POI no es un monorepo: no hay forma de compartir
 *    el módulo, así que cualquier cambio va en los dos.
 *
 * Por qué existe: la regla "qué le hace esta nota al stock y a la caja" estaba
 * escrita cuatro veces —la UI del POS, `insert_invoice` en Rust, el push del ERP
 * y la anulación del ERP— y las cuatro copias divergieron. Una NC motivo 02
 * creaba un `refund` en el POS que el servidor nunca creaba, una ND se
 * clasificaba `nd_charge` en local y `sale` en el servidor, y la ND motivo 02
 * restaba inventario en ambos lados.
 *
 * ---------------------------------------------------------------------------
 * Fundamento normativo
 * ---------------------------------------------------------------------------
 * SUNAT NO regula el efecto en stock ni en caja: los catálogos 09 y 10 son
 * codificación tributaria, y el efecto físico es consecuencia contable del
 * hecho económico. Lo que sí es normativo:
 *
 * - **Art. 10 num. 1.4 del RCP**: "Tratándose de operaciones con consumidores
 *   finales, los descuentos o bonificaciones deberán constar en el mismo
 *   comprobante de pago." ⇒ los motivos 04, 05 y 08 NO pueden emitirse sobre
 *   una boleta. Reforzado por el art. 22.1 de la RS 097-2012.
 * - **Art. 26 b) de la Ley del IGV**: la anulación exige que el servicio no se
 *   haya prestado (RTF 06741-4-2020, RTF 4831-9-2012). Una "devolución" (06/07)
 *   es imposible sobre un servicio ya consumido: para eso está el motivo 09.
 * - **D.L. 25632 art. 2**: entregar bienes adicionales es una operación nueva y
 *   exige su propio comprobante. Por eso NINGUNA nota de débito mueve
 *   inventario, nunca.
 * - **Motivo 08 (bonificación)**: es el único motivo con efecto invertido —
 *   se entrega mercadería gratis, así que el stock BAJA.
 *
 * La RS 000048-2026 (una nota modifica un solo comprobante; ND de penalidades
 * inafecta al IGV) fue postergada al 1.1.2027 por la RS 000143-2026/SUNAT, así
 * que todavía no condiciona nada de esto.
 */

/** Qué le hace la nota al inventario. */
export type NoteStockEffect =
  /** El inventario vuelve a entrar, al COSTO (anulación, devolución). */
  | "return"
  /** El inventario no se toca. */
  | "none"
  /** Sale mercadería: sólo la bonificación en especie (NC 08). */
  | "issue";

/** Qué le hace la nota a la caja. */
export type NoteCashEffect =
  /** Sale dinero. Sólo sale EFECTIVO si la venta original fue en efectivo. */
  | "refund"
  /** No hay movimiento de caja. */
  | "none"
  /** Entra dinero (notas de débito). */
  | "charge";

export type ReferenceDocumentType = "factura" | "boleta";

/** Familia del motivo: decide qué formulario muestra el POS. */
export type NoteGroup =
  | "anulacion"
  | "anulacion_ruc"
  | "correccion_descripcion"
  | "descuento_global"
  | "descuento_item"
  | "devolucion_total"
  | "devolucion_parcial"
  | "bonificacion"
  | "financiero"
  | "otros";

export interface NoteEffect {
  /** Código del catálogo 09 (NC) o 10 (ND). */
  code: string;
  label: string;
  description: string;
  group: NoteGroup;
  stock: NoteStockEffect;
  cash: NoteCashEffect;
  /** Tipos de comprobante sobre los que puede emitirse. */
  allowedOn: ReferenceDocumentType[];
  /** Si puede emitirse sobre un comprobante que sólo contiene servicios. */
  allowedForServices: boolean;
}

const BOTH: ReferenceDocumentType[] = ["factura", "boleta"];
const ONLY_FACTURA: ReferenceDocumentType[] = ["factura"];

/** Catálogo 09 — tipo de nota de crédito electrónica. */
export const NC_EFFECTS: Record<string, NoteEffect> = {
  "01": {
    code: "01",
    label: "Anulación de la operación",
    description:
      "Anula el comprobante completo. El stock vuelve a entrar y el cobro se devuelve.",
    group: "anulacion",
    stock: "return",
    cash: "refund",
    allowedOn: BOTH,
    allowedForServices: true,
  },
  "02": {
    code: "02",
    label: "Anulación por error en el RUC",
    description:
      "El RUC del cliente estaba mal. Anula el documento para re-emitirlo con el RUC correcto: no se devuelve dinero ni entra stock, porque la re-emisión hereda ambos.",
    group: "anulacion_ruc",
    stock: "none",
    cash: "none",
    allowedOn: ONLY_FACTURA,
    allowedForServices: true,
  },
  "03": {
    code: "03",
    label: "Corrección por error en la descripción",
    description:
      "Corrige textos de los ítems. Sin efecto económico: no toca montos, stock ni caja.",
    group: "correccion_descripcion",
    stock: "none",
    cash: "none",
    allowedOn: BOTH,
    allowedForServices: true,
  },
  "04": {
    code: "04",
    label: "Descuento global",
    description:
      "Descuento sobre el total del comprobante. Sólo sobre factura: en una boleta el descuento debe constar en el propio comprobante (art. 10 num. 1.4 del RCP).",
    group: "descuento_global",
    stock: "none",
    cash: "refund",
    allowedOn: ONLY_FACTURA,
    allowedForServices: true,
  },
  "05": {
    code: "05",
    label: "Descuento por item",
    description:
      "Descuento sobre ítems concretos. Sólo sobre factura, por la misma razón que el motivo 04.",
    group: "descuento_item",
    stock: "none",
    cash: "refund",
    allowedOn: ONLY_FACTURA,
    allowedForServices: true,
  },
  "06": {
    code: "06",
    label: "Devolución total",
    description:
      "El cliente devuelve toda la mercadería. El stock vuelve a entrar y se devuelve el cobro. No aplica a servicios: usa el motivo 01 o el 09.",
    group: "devolucion_total",
    stock: "return",
    cash: "refund",
    allowedOn: BOTH,
    allowedForServices: false,
  },
  "07": {
    code: "07",
    label: "Devolución por item",
    description:
      "El cliente devuelve parte de la mercadería. Entra sólo lo devuelto y el cobro se devuelve en proporción. No aplica a servicios.",
    group: "devolucion_parcial",
    stock: "return",
    cash: "refund",
    allowedOn: BOTH,
    allowedForServices: false,
  },
  "08": {
    code: "08",
    label: "Bonificación",
    description:
      "Mercadería entregada gratis además de lo facturado. Es el único motivo que SACA stock, y no mueve caja. Sólo sobre factura (art. 10 num. 1.4 del RCP).",
    group: "bonificacion",
    stock: "issue",
    cash: "none",
    allowedOn: ONLY_FACTURA,
    allowedForServices: false,
  },
  "09": {
    code: "09",
    label: "Disminución en el valor",
    description:
      "El precio cobrado era superior al correcto. Se devuelve la diferencia; el inventario no se mueve. Es el motivo correcto para un servicio ya prestado.",
    group: "financiero",
    stock: "none",
    cash: "refund",
    allowedOn: BOTH,
    allowedForServices: true,
  },
  "10": {
    code: "10",
    label: "Otros conceptos",
    description:
      "Ajuste contable por otro motivo. Se devuelve el importe indicado; el inventario no se mueve.",
    group: "otros",
    stock: "none",
    cash: "refund",
    allowedOn: BOTH,
    allowedForServices: true,
  },
};

/**
 * Catálogo 10 — tipo de nota de débito electrónica.
 * Las tres entradas comparten `stock: "none"`: una ND sólo hace entrar dinero.
 */
export const ND_EFFECTS: Record<string, NoteEffect> = {
  "01": {
    code: "01",
    label: "Intereses por mora",
    description: "Cobro de intereses por pago retrasado. No toca inventario.",
    group: "otros",
    stock: "none",
    cash: "charge",
    allowedOn: BOTH,
    allowedForServices: true,
  },
  "02": {
    code: "02",
    label: "Aumento en el valor",
    description:
      "El precio facturado era inferior al correcto. Cobra la diferencia. Entregar bienes adicionales NO es una nota de débito: es una venta nueva con su propio comprobante (D.L. 25632 art. 2).",
    group: "financiero",
    stock: "none",
    cash: "charge",
    allowedOn: BOTH,
    allowedForServices: true,
  },
  "03": {
    code: "03",
    label: "Penalidades / Otros cargos",
    description:
      "Cargos por incumplimiento, gastos administrativos u otros conceptos. No toca inventario.",
    group: "otros",
    stock: "none",
    cash: "charge",
    allowedOn: BOTH,
    allowedForServices: true,
  },
};

export const NC_DEFAULT_CODE = "01";
export const ND_DEFAULT_CODE = "02";

export type NoteDocumentType = "nota_credito" | "nota_debito";

export function isNoteDocument(documentType: string): documentType is NoteDocumentType {
  return documentType === "nota_credito" || documentType === "nota_debito";
}

function catalogFor(documentType: NoteDocumentType): Record<string, NoteEffect> {
  return documentType === "nota_credito" ? NC_EFFECTS : ND_EFFECTS;
}

/**
 * Efecto de una nota. Devuelve `null` para un código desconocido — el llamador
 * decide: los efectos económicos deben tratarlo como "no hagas nada" en vez de
 * caer a un default que mueva dinero o inventario por su cuenta.
 */
export function getNoteEffect(
  documentType: string,
  code: string | null | undefined,
): NoteEffect | null {
  if (!isNoteDocument(documentType)) return null;
  const catalog = catalogFor(documentType);
  const fallback =
    documentType === "nota_credito" ? NC_DEFAULT_CODE : ND_DEFAULT_CODE;
  return catalog[code || fallback] ?? null;
}

/** Etiqueta legible del motivo, para tickets, PDF y el `descripcionMotivo` de SUNAT. */
export function noteReasonLabel(
  documentType: string,
  code: string | null | undefined,
): string {
  return getNoteEffect(documentType, code)?.label ?? code ?? "";
}

/**
 * Motivos emitibles sobre un comprobante concreto.
 *
 * `hasGoods` = el comprobante contiene mercadería física (productos o insumos).
 * Cuando no se puede determinar conviene pasar `true`: bloquear una nota
 * legítima es peor que ofrecer un motivo de más, que el usuario puede no elegir.
 */
export function availableNoteReasons(
  documentType: NoteDocumentType,
  referenceDocumentType: ReferenceDocumentType,
  hasGoods: boolean,
): NoteEffect[] {
  return Object.values(catalogFor(documentType))
    .filter((effect) => {
      if (!effect.allowedOn.includes(referenceDocumentType)) return false;
      if (!hasGoods && !effect.allowedForServices) return false;
      return true;
    })
    // El orden NO puede salir del objeto: "10" es un índice entero canónico
    // para JavaScript y "01" no lo es, así que `Object.values` devuelve el
    // motivo 10 el PRIMERO. En un desplegable eso deja "Otros conceptos"
    // arriba y convierte al 10 en el motivo por defecto. Los códigos van con
    // cero a la izquierda, así que el orden lexicográfico es el numérico.
    .sort((a, b) => a.code.localeCompare(b.code));
}
