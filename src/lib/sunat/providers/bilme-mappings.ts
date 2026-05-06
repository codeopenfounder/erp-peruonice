/**
 * Catálogos SUNAT requeridos por la API de Bilme.
 * Bilme exige códigos exactos del catálogo SUNAT en cada campo.
 */

/** Catálogo 01 SUNAT — Tipo de comprobante */
export function mapCodigoTipoDocumento(documentType: string): string {
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
      throw new Error(`Tipo de documento no soportado: ${documentType}`);
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
      return "11";
    default:
      return "10";
  }
}

/** Catálogo 05 SUNAT — Tipo de tributo */
export interface TributoMapping {
  codigoTributo: string;
  nombreTributo: string;
  codigoInternacional: string;
}

export function mapCodigoTributo(taxType: string): TributoMapping {
  switch (taxType) {
    case "exonerado":
      return {
        codigoTributo: "9997",
        nombreTributo: "EXO",
        codigoInternacional: "VAT",
      };
    case "inafecto":
      return {
        codigoTributo: "9998",
        nombreTributo: "INA",
        codigoInternacional: "FRE",
      };
    case "gratuita":
    case "gratuito":
      return {
        codigoTributo: "9996",
        nombreTributo: "GRA",
        codigoInternacional: "FRE",
      };
    case "gravado":
    default:
      return {
        codigoTributo: "1000",
        nombreTributo: "IGV",
        codigoInternacional: "VAT",
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

/** Catálogo 09 SUNAT — Tipos de motivo de baja */
export function mapMotivoBaja(documentType: string, reason?: string): string {
  if (reason) return reason;
  return "Anulación de la operación";
}

/** Catálogo 16 SUNAT — Tipo de precio (01 = Precio unitario, 02 = Valor referencial gratuito) */
export function mapCodigoTipoPrecio(taxType: string): string {
  return taxType === "gratuita" || taxType === "gratuito" ? "02" : "01";
}
