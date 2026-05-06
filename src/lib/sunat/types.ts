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

export interface VoidResult {
  success: boolean;
  ticket: string | null;
  error: string | null;
}

export interface StatusResult {
  success: boolean;
  hash: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
  message: string | null;
}

export interface SunatProvider {
  readonly name: string;
  submit(
    config: FactConfig,
    invoiceId: string,
    invoice: SunatInvoiceInput,
  ): Promise<SunatProviderResponse>;
  void(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
    reason: string,
  ): Promise<VoidResult>;
  status(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
  ): Promise<StatusResult>;
}

export const SUNAT_STATUS_MAP: Record<SunatStatus, string> = {
  ACEPTADO: "accepted",
  RECHAZADO: "rejected",
  PENDIENTE: "sent_to_sunat",
};
