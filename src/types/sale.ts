// --------------------------------------------------------------------------
// Sales / Transacciones types for POI ERP
// --------------------------------------------------------------------------

export interface SalesKPIs {
  total_sales: number;
  transaction_count: number;
  average_ticket: number;
  items_sold: number;
  by_payment: Record<string, { count: number; total: number }>;
  by_hour: { hour: number; count: number; total: number }[];
}

export interface SalesFilters {
  date?: string;
  payment_method?: string;
  cash_register_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface SaleListItem {
  id: string;
  created_at: string;
  issue_date: string;
  document_type: string;
  series_code: string;
  correlative_number: number;
  customer_name: string | null;
  customer_document_number: string | null;
  items_count: number;
  op_gravada: number;
  op_exonerada: number;
  op_inafecta: number;
  igv_total: number;
  discount_total: number;
  promotion_discount: number;
  total: number;
  payment_method: string | null;
  cashier_name: string | null;
  cash_register_name: string | null;
  branch_name: string | null;
  status: string;
}
