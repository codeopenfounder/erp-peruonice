/**
 * Helpers compartidos entre adaptadores SUNAT.
 */

export const SUNAT_CUSTOMER_DOC_TYPES: Record<string, string> = {
  ruc: "6",
  dni: "1",
  ce: "4",
  pasaporte: "7",
  sin_documento: "0",
};

export const NC_REASONS: Record<string, string> = {
  "01": "Anulación de la operación",
  "02": "Anulación por error en el RUC",
  "03": "Corrección por error en la descripción",
  "04": "Descuento global",
  "05": "Descuento por item",
  "06": "Devolución total",
  "07": "Devolución por item",
  "08": "Bonificacion",
  "09": "Disminucion en el valor",
  "10": "Otros conceptos",
};

export const ND_REASONS: Record<string, string> = {
  "01": "Intereses por mora",
  "02": "Aumento en el valor",
  "03": "Penalidades / otros cargos",
};

export function mapCustomerDocType(docType: string | null | undefined): string {
  return SUNAT_CUSTOMER_DOC_TYPES[docType || "sin_documento"] || "0";
}

export function getNCReason(code: string | undefined): string {
  return NC_REASONS[code || "01"] || NC_REASONS["01"];
}

export function getNDReason(code: string | undefined): string {
  return ND_REASONS[code || "02"] || ND_REASONS["02"];
}

export function padCorrelative(num: number, width = 8): string {
  return String(num).padStart(width, "0");
}

/**
 * Normaliza una fecha que puede venir como ISO con TZ ("2026-05-05T10:00:00+00:00")
 * o como timestamp UTC sin indicador ("2026-05-05 10:00:00") y la convierte a la
 * zona horaria de Perú (America/Lima, UTC-5 sin DST).
 */
export function formatEmissionDate(rawDate: string): {
  date: Date;
  fecha: string;
  hora: string;
} {
  const emissionDate = /[TZ+]/.test(rawDate)
    ? new Date(rawDate)
    : new Date(rawDate.replace(" ", "T") + "Z");
  const fecha = emissionDate.toLocaleDateString("en-CA", {
    timeZone: "America/Lima",
  });
  const hora = emissionDate.toLocaleTimeString("en-GB", {
    timeZone: "America/Lima",
    hour12: false,
  });
  return { date: emissionDate, fecha, hora };
}

export function addDaysISO(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
