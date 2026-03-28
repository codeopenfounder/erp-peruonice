export type ArqueoType = "cierre" | "sorpresa"

export interface DenominationCounts {
  [denomination: string]: number
}

export interface ArqueoListItem {
  id: string
  type: ArqueoType
  cash_register_name: string
  cash_register_code: string
  branch_name: string | null
  cashier_name: string | null
  supervisor_name: string | null
  expected_amount: number
  counted_amount: number
  difference: number
  created_at: string
  period_start: string | null
  period_end: string | null
}

export interface ArqueoDetail extends ArqueoListItem {
  opening_id: string | null
  opening_amount: number
  total_sales_cash: number
  total_sales_card: number
  total_sales_transfer: number
  total_income: number
  total_expense: number
  total_refunds: number
  total_petty_cash: number
  sale_count: number
  movement_count: number
  denomination_counts: DenominationCounts
  notes: string | null
}

export interface ArqueoMovementItem {
  id: string
  type: string
  amount: number
  description: string | null
  reason: string | null
  receipt_number: string | null
  payment_method: string | null
  created_by_name: string | null
  created_at: string
}

export interface ArqueoFilters {
  type?: ArqueoType
  cash_register_id?: string
  date_from?: string
  date_to?: string
  page?: number
}

export interface ArqueoKPIs {
  total_month: number
  total_sorpresas_month: number
  avg_difference: number
  flagged_count: number
}

export interface OpenRegisterSummary {
  opening_id: string
  opened_by_name: string | null
  opened_at: string
  opening_amount: number
  total_sales_cash: number
  total_sales_card: number
  total_sales_transfer: number
  total_income: number
  total_expense: number
  total_refunds: number
  total_petty_cash: number
  sale_count: number
  movement_count: number
  expected_amount: number
}
