export type TimeGranularity = "hourly" | "daily" | "monthly";

export interface DashboardFilters {
  date_from: string;
  date_to: string;
  branch_id?: string;
  granularity: TimeGranularity;
}

export interface SalesSummary {
  total_revenue: number;
  transaction_count: number;
  avg_ticket: number;
  prev_total_revenue: number;
  prev_transaction_count: number;
  prev_avg_ticket: number;
  revenue_cash: number;
  revenue_card: number;
  revenue_transfer: number;
  revenue_credit: number;
  revenue_mixed: number;
  facturas_count: number;
  boletas_count: number;
  tickets_count: number;
}

export interface HourlySalesPoint {
  hour_of_day: number;
  revenue: number;
  tx_count: number;
}

export interface ProductRankingItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  units_sold: number;
  total_revenue: number;
  pct_of_total: number;
  avg_unit_price: number;
}

export interface OperationalLeaks {
  voided_count: number;
  voided_amount: number;
  voided_pct_tx: number;
  voided_pct_revenue: number;
  cortesia_count: number;
  cortesia_amount: number;
  cortesia_pct_tx: number;
  cortesia_pct_revenue: number;
  promo_tx_count: number;
  promo_discount_total: number;
  promo_pct_tx: number;
  promo_pct_revenue: number;
  total_tx: number;
  total_revenue: number;
}

export interface InventoryHealth {
  total_audits: number;
  items_audited: number;
  items_with_discrepancy: number;
  total_discrepancy_value: number;
  efficiency_pct: number;
  waste_movements: number;
  waste_value: number;
  shrinkage_movements: number;
  shrinkage_value: number;
  breakage_movements: number;
  breakage_value: number;
}

export interface DailyTrendPoint {
  date: string;
  total_revenue: number;
  transaction_count: number;
  avg_ticket: number;
  voided_amount: number;
  cortesia_amount: number;
  promotion_discount_total: number;
}

export interface ProductRankingResult {
  top: ProductRankingItem[];
  flop: ProductRankingItem[];
}
