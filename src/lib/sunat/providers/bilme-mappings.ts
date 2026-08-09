/**
 * Catálogos SUNAT requeridos por la API de Bilme.
 * Bilme exige códigos exactos del catálogo SUNAT en cada campo.
 */

/** Catálogo 01 SUNAT — Tipo de comprobante */
export function mapCodigoTipoDocumento(documentType: string): string {
  const code = tryMapCodigoTipoDocumento(documentType);
  if (!code) {
    throw new Error(`Tipo de documento no soportado: ${documentType}`);
  }
  return code;
}

/**
 * Variante que no lanza. `invoices.document_type` admite además 'ticket', que no
 * es un comprobante electrónico: quien reciba null debe cortar con un error
 * legible en vez de reventar a mitad de la emisión.
 */
export function tryMapCodigoTipoDocumento(documentType: string): string | null {
  switch (documentType) {
    case "factura":
      return "01";
    case "boleta":
      return "03";
    case "nota_credito":
      return "07";
    case "nota_debito":
      return "08";
    default:
      return null;
  }
}

/** Catálogo 07 SUNAT — Códigos de afectación del IGV */
export function mapCodigoAfectacionIgv(taxType: string): string {
  switch (taxType) {
    case "gravado":
      return "10";
    case "exonerado":
      return "20";
    case "inafecto":
      return "30";
    case "gratuita":
    case "gratuito":
      return mapCodigoAfectacionGratuita("gravado");
    default:
      return "10";
  }
}

/**
 * Catálogo 07 SUNAT — código de GRATUIDAD, derivado de la afectación del bien.
 *
 * Una entrega sin contraprestación no se declara con el código oneroso del bien
 * (10/20/30): tiene códigos propios, y cuál toca depende de si el bien es gravado,
 * exonerado o inafecto.
 *
 * | Bien | Código | Descripción SUNAT |
 * |---|---|---|
 * | gravado | **15** | Gravado – Bonificaciones |
 * | exonerado | 21 | Exonerado – Transferencia gratuita |
 * | inafecto | 37 | Inafecto – Transferencia gratuita |
 *
 * `15` y no `11` (retiro por premio) ni `13` (retiro genérico): lo que hace el
 * negocio es entregar algo gratis **acompañando a una venta**, que es literalmente
 * una bonificación. Es además coherente con la NC motivo 08 del catálogo 09, que
 * `note-effects.ts` ya modela como el único motivo que SACA stock.
 *
 * El tributo de la línea es siempre 9996 (GRA), independientemente del código:
 * lo resuelve `mapCodigoTributo("gratuito")`.
 */
export function mapCodigoAfectacionGratuita(taxType: string): string {
  switch (taxType) {
    case "exonerado":
      return "21";
    case "inafecto":
      return "37";
    case "gravado":
    default:
      return "15";
  }
}

/**
 * Catálogo 05 SUNAT — Tipo de tributo.
 * Bilme espera el código internacional en `codigoInterTributo` (no
 * `codigoInternacional`) y exige además `idCategoria`, que es la columna
 * "Categoría" del mismo catálogo.
 */
export interface TributoMapping {
  codigoTributo: string;
  nombreTributo: string;
  codigoInterTributo: string;
  idCategoria: string;
}

export function mapCodigoTributo(taxType: string): TributoMapping {
  switch (taxType) {
    case "exonerado":
      return {
        codigoTributo: "9997",
        nombreTributo: "EXO",
        codigoInterTributo: "VAT",
        idCategoria: "E",
      };
    case "inafecto":
      return {
        codigoTributo: "9998",
        nombreTributo: "INA",
        codigoInterTributo: "FRE",
        idCategoria: "O",
      };
    case "gratuita":
    case "gratuito":
      return {
        codigoTributo: "9996",
        nombreTributo: "GRA",
        codigoInterTributo: "FRE",
        idCategoria: "Z",
      };
    case "gravado":
    default:
      return {
        codigoTributo: "1000",
        nombreTributo: "IGV",
        codigoInterTributo: "VAT",
        idCategoria: "S",
      };
  }
}

/**
 * Catálogo 03 SUNAT — Unidades de medida.
 * Whitelist conservadora; si la unidad ya es código SUNAT válido, pasa directo.
 */
const SUNAT_UNIT_WHITELIST = new Set([
  "NIU",
  "ZZ",
  "KGM",
  "BG",
  "EA",
  "KWH",
  "MTR",
  "LTR",
  "GRM",
  "SET",
  "PR",
  "BX",
  "PK",
  "DZN",
  "GLI",
  "GLL",
  "MGM",
  "MLT",
  "MMT",
  "ONZ",
  "TNE",
  "BLL",
  "HUR",
  "DAY",
  "MON",
  "ANN",
]);

const UNIT_ALIASES: Record<string, string> = {
  unidad: "NIU",
  unidades: "NIU",
  und: "NIU",
  un: "NIU",
  pza: "NIU",
  pieza: "NIU",
  servicio: "ZZ",
  serv: "ZZ",
  kg: "KGM",
  kilo: "KGM",
  kilogramo: "KGM",
  bolsa: "BG",
  caja: "BX",
  par: "PR",
  hora: "HUR",
  litro: "LTR",
  metro: "MTR",
  paquete: "PK",
  docena: "DZN",
};

export function mapCodigoUnidad(unit: string | null | undefined): string {
  if (!unit) return "NIU";
  const upper = unit.toUpperCase();
  if (SUNAT_UNIT_WHITELIST.has(upper)) return upper;
  const alias = UNIT_ALIASES[unit.toLowerCase()];
  if (alias) return alias;
  return "NIU";
}

/**
 * Catálogo 25 SUNAT — Código de producto (UNSPSC, 8 dígitos).
 * Verificado contra la API: Bilme NO valida este código (aceptó `99999999`),
 * y sus propios ejemplos usan el mismo valor para mochilas, libros y manzanas.
 * Se envía un genérico hasta que el catálogo de productos lo modele.
 */
export const DEFAULT_CODIGO_CLASIFICACION = "10191509";

/** Catálogo 16 SUNAT — Tipo de precio (01 = Precio unitario, 02 = Valor referencial gratuito) */
export function mapCodigoTipoPrecio(taxType: string): string {
  return taxType === "gratuita" || taxType === "gratuito" ? "02" : "01";
}
