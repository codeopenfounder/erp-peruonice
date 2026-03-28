export interface DashboardFilters {
  date_from: string;
  date_to: string;
  branch_id?: string;
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
  products_sold: number;
}

export interface ProductRankingItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  units_sold: number;
  total_revenue: number;
  pct_of_total: number;
  avg_unit_price: number;
  cost_price: number;
  margin: number;
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
  staff_consumption_movements: number;
  staff_consumption_value: number;
  waste_units: number;
  shrinkage_units: number;
  breakage_units: number;
  staff_consumption_units: number;
  total_loss_value: number;
  loss_pct_of_sales: number;
  loss_pct_of_transactions: number;
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

export interface AttendanceSummary {
  total_entries: number;
  total_scans: number;
  unique_reservations: number;
  active_sessions: number;
  avg_dwell_minutes: number;
  prev_total_entries: number;
  entries_sold: number;
  prev_entries_sold: number;
  no_show_rate: number;
}

export interface HourlyAttendancePoint {
  hour_of_day: number;
  entries: number;
  scan_count: number;
  occupancy_pct: number;
  entries_sold: number;
}

export interface ExpensesSummary {
  total_expense_amount: number;
  expense_count: number;
  prev_expense_amount: number;
  prev_expense_count: number;
}

export interface ExpensesTrendPoint {
  expense_date: string;
  total_amount: number;
  movement_count: number;
}

