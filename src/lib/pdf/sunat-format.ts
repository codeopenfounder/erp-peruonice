// Helpers de formateo SUNAT compartidos.
// Mantén este archivo sincronizado con kronos-fact/src/lib/pdf/sunat-format.ts.

export type DocumentType = "boleta" | "factura" | "nota_credito" | "nota_debito";

export function docLabel(type: string): string {
  switch (type) {
    case "boleta": return "BOLETA DE VENTA ELECTRÓNICA";
    case "factura": return "FACTURA ELECTRÓNICA";
    case "nota_credito": return "NOTA DE CRÉDITO ELECTRÓNICA";
    case "nota_debito": return "NOTA DE DÉBITO ELECTRÓNICA";
    default: return "COMPROBANTE";
  }
}

export function sunatDocCode(type: string): string {
  switch (type) {
    case "factura": return "01";
    case "boleta": return "03";
    case "nota_credito": return "07";
    case "nota_debito": return "08";
    default: return "00";
  }
}

export function customerDocCode(type: string): string {
  switch (type) {
    case "ruc": return "6";
    case "dni": return "1";
    case "ce": return "4";
    case "passport": return "7";
    default: return "-";
  }
}

export function formatPayment(m: string): string {
  switch (m) {
    case "cash": return "Efectivo";
    case "card": return "Tarjeta";
    case "transfer": return "Transferencia";
    case "credit": return "Crédito";
    case "mixed": return "Mixto";
    default: return m;
  }
}

export function formatDate(iso: string): string {
  if (iso.length >= 16) {
    const [y, m, d] = iso.slice(0, 10).split("-");
    const time = iso.slice(11, 16);
    return `${d}/${m}/${y} ${time}`;
  }
  if (iso.length >= 10) {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return iso;
}

export function formatDateOnly(iso: string): string {
  if (iso.length >= 10) {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return iso;
}

export function padCorrelative(n: number, size = 8): string {
  return String(n).padStart(size, "0");
}

export function currencySymbol(currency: string): string {
  return currency === "USD" ? "US$" : "S/";
}

export const NC_REASONS: Record<string, string> = {
  "01": "Anulación de la operación",
  "02": "Anulación por error en el RUC",
  "03": "Corrección por error en la descripción",
  "04": "Descuento global",
  "05": "Descuento por item",
  "06": "Devolución total",
  "07": "Devolución por item",
  "09": "Disminución en el valor",
  "10": "Otros conceptos",
};

export const ND_REASONS: Record<string, string> = {
  "01": "Intereses por mora",
  "02": "Aumento en el valor",
  "03": "Penalidades / Otros cargos",
};

export function reasonLabel(code: string, docType: string): string {
  const reasons = docType === "nota_credito" ? NC_REASONS : ND_REASONS;
  return reasons[code] || code;
}

export function buildSunatQrPayload(args: {
  ruc: string;
  documentType: string;
  seriesCode: string;
  correlative: number;
  igvTotal: number;
  total: number;
  issueDateIso: string;
  customerDocType: string | null;
  customerDocNumber: string | null;
}): string {
  const dateStr = formatDateOnly(args.issueDateIso);
  return [
    args.ruc,
    sunatDocCode(args.documentType),
    args.seriesCode,
    args.correlative,
    args.igvTotal.toFixed(2),
    args.total.toFixed(2),
    dateStr,
    args.customerDocType ? customerDocCode(args.customerDocType) : "-",
    args.customerDocNumber || "-",
    "",
  ].join("|");
}
