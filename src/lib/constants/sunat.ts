// --------------------------------------------------------------------------
// SUNAT constants — Peru electronic invoicing compliance
// --------------------------------------------------------------------------

export const IGV_RATE = 18.0;
export const IGV_RATE_SPLIT = { igv: 16.0, ipm: 2.0 };

export const SUNAT_DOCUMENT_TYPES = {
  factura: "01",
  boleta: "03",
  nota_credito: "07",
  nota_debito: "08",
} as const;

export const SUNAT_IDENTITY_TYPES = {
  sin_documento: "0",
  dni: "1",
  ce: "4",
  ruc: "6",
  passport: "7",
} as const;

export const SUNAT_UNITS_OF_MEASURE = {
  NIU: "Unidad",
  ZZ: "Servicio",
  KGM: "Kilogramo",
  LTR: "Litro",
  MTR: "Metro",
  BX: "Caja",
  DZN: "Docena",
  GLL: "Galon",
  TNE: "Tonelada",
} as const;

/** Units of measure that support decimal quantities (weight, volume, length) */
export const DECIMAL_UNITS = new Set(["KGM", "LTR", "MTR", "GLL", "TNE", "ZZ"]);

export const SUNAT_TAX_TYPES = {
  gravado: { code: "10", name: "Gravado - Operacion Onerosa" },
  exonerado: { code: "20", name: "Exonerado - Operacion Onerosa" },
  inafecto: { code: "30", name: "Inafecto - Operacion Onerosa" },
} as const;

export const CURRENCIES = {
  PEN: { code: "PEN", symbol: "S/.", name: "Sol" },
  USD: { code: "USD", symbol: "$", name: "Dolar" },
} as const;

export const SERIES_PREFIXES = {
  F: "Factura",
  B: "Boleta",
} as const;

export const SERIES_DOCUMENT_TYPE_MAP: Record<string, string> = {
  F: "factura",
  B: "boleta",
};

export const DOCUMENT_TYPE_SERIES_PREFIX: Record<string, string> = {
  factura: "F",
  boleta: "B",
};

export const TAX_TYPE_OPTIONS = [
  { value: "gravado", label: "Gravado (IGV 18%)" },
  { value: "exonerado", label: "Exonerado" },
  { value: "inafecto", label: "Inafecto" },
] as const;

export const CURRENCY_OPTIONS = [
  { value: "PEN", label: "Soles (S/.)" },
  { value: "USD", label: "Dolares ($)" },
] as const;

export const UOM_OPTIONS = Object.entries(SUNAT_UNITS_OF_MEASURE).map(([value, label]) => ({
  value,
  label: `${value} - ${label}`,
}));
