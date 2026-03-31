export type PaymentLinkStatus = "pending" | "paid" | "expired" | "cancelled" | "failed"

export interface PaymentLinkListItem {
  id: string
  status: PaymentLinkStatus
  amount: number
  currency: string
  description: string | null
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  product_name: string | null
  branch_name: string | null
  reservation_date: string | null
  slot_start: string | null
  slot_end: string | null
  quantity: number
  culqi_link_url: string | null
  invoice_id: string | null
  paid_at: string | null
  expires_at: string | null
  created_at: string
}

export interface PaymentLinkDetail extends PaymentLinkListItem {
  culqi_link_id: string | null
  culqi_order_id: string | null
  customer_document_type: string | null
  customer_document_number: string | null
  product_id: string | null
  branch_id: string | null
  reservation_id: string | null
  created_by: string | null
}

export interface PaymentLinkFilters {
  status?: PaymentLinkStatus
  date_from?: string
  date_to?: string
  page?: number
}

export interface PaymentLinkKPIs {
  active_count: number
  paid_month: number
  total_collected_month: number
  pending_count: number
}
