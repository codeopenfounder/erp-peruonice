// --------------------------------------------------------------------------
// Invoice & Cash Register types for POI ERP
// --------------------------------------------------------------------------

export type DocumentType = "factura" | "boleta" | "nota_credito" | "nota_debito";
export type SeriesDocumentType = "factura" | "boleta";
export type CustomerDocumentType = "ruc" | "dni" | "ce" | "passport" | "sin_documento";
export type InvoiceStatus = "draft" | "issued" | "sent_to_sunat" | "accepted" | "rejected" | "voided" | "pending_void";
export type PaymentMethod = "cash" | "card" | "transfer" | "credit" | "mixed";
export type CashMovementType = "sale" | "income" | "expense" | "refund" | "petty_cash_in";
export type OpeningStatus = "open" | "closed";
export type FactProvider = "apisunat";

// --- Core Database Interfaces ---

export interface Customer {
  id: string;
  tenant_id: string;
  document_type: CustomerDocumentType;
  document_number: string;
  legal_name: string;
  trade_name: string | null;
  address: string | null;
  ubigeo: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CashRegister {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  code: string;
  petty_cash_amount: number;
  is_active: boolean;
  current_opening_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashRegisterOpening {
  id: string;
  tenant_id: string;
  cash_register_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  opened_at: string;
  closed_at: string | null;
  status: OpeningStatus;
  notes: string | null;
  created_at: string;
}

export interface InvoiceSeries {
  id: string;
  tenant_id: string;
  series_code: string;
  document_type: SeriesDocumentType;
  current_correlative: number;
  cash_register_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  series_id: string;
  correlative_number: number;
  document_type: DocumentType;
  customer_id: string | null;
  issue_date: string;
  currency: string;
  exchange_rate: number;
  op_gravada: number;
  op_exonerada: number;
  op_inafecta: number;
  igv_total: number;
  isc_total: number;
  icbper_total: number;
  discount_total: number;
  total: number;
  status: InvoiceStatus;
  sunat_response_code: string | null;
  sunat_response_desc: string | null;
  xml_url: string | null;
  cdr_url: string | null;
  hash_code: string | null;
  notes: string | null;
  cash_register_id: string | null;
  opening_id: string | null;
  cashier_id: string | null;
  payment_method: PaymentMethod | null;
  reference_invoice_id: string | null;
  reference_reason: string | null;
  promotion_id: string | null;
  promotion_discount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_document_type: string | null;
  customer_document_number: string | null;
  customer_address: string | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_of_measure: string;
  discount_percentage: number;
  discount_amount: number;
  tax_type: string;
  igv_rate: number;
  igv_amount: number;
  isc_rate: number;
  isc_amount: number;
  icbper_amount: number;
  subtotal: number;
  total: number;
  sort_order: number;
  is_cortesia: boolean;
  cortesia_reason: string | null;
  original_unit_price: number | null;
  supply_id: string | null;
  created_at: string;
}

export interface CashRegisterMovement {
  id: string;
  tenant_id: string;
  opening_id: string | null;
  type: CashMovementType;
  amount: number;
  description: string | null;
  reason: string | null;
  receipt_number: string | null;
  invoice_id: string | null;
  payment_method: string | null;
  cash_register_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FactConfig {
  id: string;
  tenant_id: string;
  provider: FactProvider;
  api_token: string | null;
  ruc: string;
  razon_social: string;
  direccion_fiscal: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  logo_url: string | null;
  is_production: boolean;
  is_active: boolean;
  detraction_account: string | null;
  created_at: string;
  updated_at: string;
}

export interface FactUserAssignment {
  id: string;
  tenant_id: string;
  user_id: string;
  cash_register_id: string | null;
  pin_code: string | null;
  is_active: boolean;
  created_at: string;
}

// --- Derived Types ---

export interface CashRegisterListItem extends CashRegister {
  branch_name: string | null;
  is_open: boolean;
}

export interface InvoiceSeriesListItem extends InvoiceSeries {
  branch_name: string | null;
  cash_register_name: string | null;
}

export interface FactUserListItem extends FactUserAssignment {
  user_email: string;
  user_name: string;
  cash_register_name: string | null;
}

// --- Ventas Section Types ---

export interface InvoiceListItem {
  id: string;
  document_type: DocumentType;
  correlative_number: number;
  series_code: string;
  issue_date: string;
  customer_name: string | null;
  customer_document_type: string | null;
  customer_document_number: string | null;
  total: number;
  status: InvoiceStatus;
  payment_method: PaymentMethod | null;
  cash_register_name: string | null;
  branch_name: string | null;
  created_at: string;
  reference_series_code: string | null;
  reference_correlative: number | null;
  sunat_response_code: string | null;
  sunat_response_desc: string | null;
  sunat_document_id: string | null;
}

export interface InvoiceDetail extends Invoice {
  series_code: string;
  cash_register_name: string | null;
  branch_name: string | null;
  cashier_name: string | null;
  items: InvoiceItem[];
}

export interface CustomerListItem {
  id: string;
  document_type: string;
  document_number: string;
  legal_name: string;
  trade_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface InvoiceFilters {
  page?: number;
  document_type?: string;
  status?: string;
  payment_method?: string;
  date_from?: string;
  date_to?: string;
  cash_register_id?: string;
  search?: string;
}

export interface CustomerFilters {
  page?: number;
  document_type?: string;
  search?: string;
}

export interface InvoiceKPIs {
  total_sales: number;
  total_invoices: number;
  facturas: number;
  boletas: number;
  notas_credito: number;
  by_payment: Record<string, number>;
}

export interface CustomerKPIs {
  total: number;
  ruc: number;
  dni: number;
  otros: number;
}
