/**
 * Tipos compartidos para todos los proveedores de facturación electrónica SUNAT.
 * Cualquier nuevo proveedor (apisunat, bilme, nubefact, etc.) implementa SunatProvider.
 */

export interface FactConfig {
  ruc: string;
  razon_social: string;
  direccion_fiscal: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  api_token: string;
  is_production: boolean;
  provider: string;
  tenant_id: string;
  /**
   * Declarar cortesías y adicionales como operación gratuita ante SUNAT.
   *
   * Opcional y por defecto apagado (migración 00041). Hasta ahora esas líneas se
   * caían del payload —importe 0 → filtradas—, así que una cortesía se imprimía en
   * el ticket y no existía en el comprobante electrónico. Encenderlo exige haber
   * comprobado contra la API real que el proveedor acepta la línea gratuita, porque
   * SUNAT además pide el total de venta gratuita del comprobante y Billme no
   * documenta ningún campo para él.
   */
  emit_free_lines?: boolean;
}

export interface SunatInvoiceItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  unit_of_measure: string;
  igv_rate: number;
  igv_amount: number;
  subtotal: number;
  total: number;
  tax_type: string;
  reference_value?: number;
}

export interface SunatInvoiceInput {
  id: string;
  document_type: string;
  series_code: string;
  correlative_number: number;
  customer_document_type: string | null;
  customer_document_number: string | null;
  customer_name: string | null;
  customer_address: string | null;
  op_gravada: number;
  op_exonerada: number;
  op_inafecta: number;
  igv_total: number;
  total: number;
  items: SunatInvoiceItemInput[];
  reference_series?: string;
  reference_correlative?: number;
  reference_document_type?: string;
  reference_reason?: string;
  created_at: string;
  has_detraction?: boolean;
  detraction_code?: string | null;
  detraction_percentage?: number | null;
  detraction_amount?: number | null;
  detraction_payment_method?: string | null;
  detraction_account?: string | null;
}

export type SunatStatus = "ACEPTADO" | "RECHAZADO" | "PENDIENTE";

export interface SunatProviderResponse {
  success: boolean;
  documentId: string | null;
  status: SunatStatus;
  sunatResponseCode: string | null;
  sunatResponseDesc: string | null;
  hashCode: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
  ticket?: string | null;
}

/**
 * Identidad del resumen SUNAT (RC de boletas, RA de bajas) sobre el que viaja
 * una operación asíncrona.
 *
 * SUNAT identifica un resumen por `TIPO-AAAAMMDD-N`, donde N es un correlativo
 * propio y creciente dentro de esa fecha de referencia. Lo genera el emisor, no
 * el integrador: Billme se limita a respetar el que se le manda. Quien llama al
 * adapter lo obtiene con `fn_next_summary_correlative()` — el adapter no toca la
 * base, igual que `submit()` no persiste su resultado.
 */
export interface SunatSummaryRef {
  /** Correlativo dentro de `referenceDate`, empezando en 1. */
  correlative: number;
  /** Fecha de emisión de los documentos informados, `YYYY-MM-DD`. */
  referenceDate: string;
}

export interface VoidResult {
  success: boolean;
  ticket: string | null;
  error: string | null;
  /** Identidad del resumen realmente enviado, para poder registrarlo. */
  summary?: SunatSummaryRef | null;
}

export interface StatusResult {
  success: boolean;
  hash: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
  message: string | null;
}

/** Tipo de resumen SUNAT: RC = resumen diario de boletas, RA = comunicación de baja. */
export type SunatSummaryType = "RC" | "RA";

/**
 * Resultado de consultar el ticket de un resumen.
 *
 * `pending` NO es un fallo: un resumen es asíncrono por diseño y SUNAT responde
 * "en proceso" (código 98) hasta que termina de validarlo. Quien llama debe
 * distinguir las tres ramas y volver a consultar sólo en `pending`.
 */
export interface TicketResult {
  status: "accepted" | "rejected" | "pending";
  responseCode: string | null;
  responseDesc: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
}

export interface SunatProvider {
  readonly name: string;
  submit(
    config: FactConfig,
    invoiceId: string,
    invoice: SunatInvoiceInput,
  ): Promise<SunatProviderResponse>;
  /**
   * `summary` sólo lo usan los proveedores que exigen que el emisor numere el
   * resumen (Billme). apisunat gestiona su propio correlativo de resumen y lo
   * ignora, de ahí que sea opcional.
   */
  void(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
    reason: string,
    summary?: SunatSummaryRef,
  ): Promise<VoidResult>;
  status(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
  ): Promise<StatusResult>;
  /**
   * Cierra el ciclo asíncrono: `void()` devuelve un ticket que sólo acredita que
   * SUNAT RECIBIÓ el resumen. Hasta que esto se consulte, la baja no está
   * aceptada — y hasta la migración 00041 nadie lo consultaba, así que
   * `sunat_summaries.status` se quedaba en `pending` para siempre.
   *
   * El adapter sigue siendo puro: recibe la identidad del resumen y el ticket, y
   * no toca la base. Quien llama (`lib/sunat/poll-summaries.ts`) persiste.
   */
  checkTicket(
    config: FactConfig,
    summaryType: SunatSummaryType,
    summary: SunatSummaryRef,
    ticket: string,
  ): Promise<TicketResult>;
}

export const SUNAT_STATUS_MAP: Record<SunatStatus, string> = {
  ACEPTADO: "accepted",
  RECHAZADO: "rejected",
  PENDIENTE: "sent_to_sunat",
};
