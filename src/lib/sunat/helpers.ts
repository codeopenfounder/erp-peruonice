/**
 * Helpers compartidos entre adaptadores SUNAT.
 */

import {
  NC_DEFAULT_CODE,
  NC_EFFECTS,
  ND_DEFAULT_CODE,
  ND_EFFECTS,
  noteReasonLabel,
} from "@/lib/sunat/note-effects";

/**
 * Catálogo 06 SUNAT — Tipo de documento de identidad.
 * Se aceptan las dos grafías de pasaporte porque conviven en el código:
 * `types/invoice.ts` y `lib/constants/sunat.ts` usan "passport", y el POS
 * guardaba "pasaporte". Con una sola de ellas, el otro caso caía al "0"
 * (sin documento) y SUNAT rechazaba la factura.
 */
export const SUNAT_CUSTOMER_DOC_TYPES: Record<string, string> = {
  ruc: "6",
  dni: "1",
  ce: "4",
  passport: "7",
  pasaporte: "7",
  sin_documento: "0",
};

export function mapCustomerDocType(docType: string | null | undefined): string {
  return SUNAT_CUSTOMER_DOC_TYPES[docType || "sin_documento"] || "0";
}

/**
 * Descripción del motivo que viaja a SUNAT como `descripcionMotivo`. Sale de la
 * matriz de `note-effects.ts` para que la etiqueta impresa, la del PDF y la que
 * ve SUNAT no puedan divergir: había tres copias del mapa y una de ellas ni
 * siquiera tenía el motivo 08.
 */
export function getNCReason(code: string | undefined): string {
  return noteReasonLabel("nota_credito", code) || NC_EFFECTS[NC_DEFAULT_CODE].label;
}

export function getNDReason(code: string | undefined): string {
  return noteReasonLabel("nota_debito", code) || ND_EFFECTS[ND_DEFAULT_CODE].label;
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
