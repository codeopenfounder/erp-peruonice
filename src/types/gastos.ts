import type { CashRegisterMovement } from "./invoice";

export interface GastosMovementListItem
  extends Pick<
    CashRegisterMovement,
    | "id"
    | "opening_id"
    | "type"
    | "amount"
    | "description"
    | "reason"
    | "receipt_number"
    | "payment_method"
    | "cash_register_id"
    | "invoice_id"
    | "created_at"
  > {
  created_by_name: string | null;
  branch_name: string | null;
  cash_register_name: string | null;
  cash_register_code: string | null;
}

export interface GastosFilters {
  branch_id?: string;
  cash_register_id?: string;
  date_from?: string;
  date_to?: string;
  type?: string;
  page?: number;
}

export interface GastosKPIs {
  total_sales_today: number;
  total_cash_in_today: number;
  total_cash_out_today: number;
  open_registers: number;
  total_registers: number;
}

export interface CashRegisterStatusItem {
  id: string;
  name: string;
  code: string;
  branch_name: string | null;
  is_open: boolean;
  opened_at: string | null;
  opened_by_name: string | null;
  opening_amount: number;
  petty_cash_amount: number;
  petty_cash_balance: number;
  accumulated_cash: number;
}

export interface ClosingHistoryItem {
  id: string;
  cash_register_name: string;
  cash_register_code: string;
  branch_name: string | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface ClosingHistoryFilters {
  date_from?: string;
  date_to?: string;
  cash_register_id?: string;
  page?: number;
}

export interface ExpenseFundStatusItem {
  id: string;
  name: string;
  code: string;
  branch_name: string | null;
  capital: number;
  balance: number;
  expenses_count: number;
}

export interface ExpenseFundMovementItem {
  id: string;
  cash_register_id: string;
  type: string;
  amount: number;
  description: string | null;
  reason: string | null;
  receipt_number: string | null;
  authorized_by: string | null;
  authorized_name: string | null;
  created_by_name: string | null;
  created_at: string;
  cash_register_name: string | null;
  cash_register_code: string | null;
  branch_name: string | null;
}

export interface ExpenseFundFilters {
  cash_register_id?: string;
  type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export interface DailyReportData {
  openings: Array<{
    id: string;
    opened_by_name: string | null;
    closed_by_name: string | null;
    opening_amount: number;
    closing_amount: number | null;
    expected_amount: number | null;
    difference: number | null;
    opened_at: string;
    closed_at: string | null;
    notes: string | null;
    cash_register_name: string;
    branch_name: string | null;
  }>;
  movements: GastosMovementListItem[];
  sales_by_type: Record<string, { count: number; total: number }>;
  sales_by_payment: Record<string, number>;
  totals: {
    total_sales: number;
    total_cash_in: number;
    total_cash_out: number;
    total_refunds: number;
  };
}
