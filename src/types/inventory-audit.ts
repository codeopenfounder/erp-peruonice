export type AuditStatus = "pending" | "approved" | "rejected";

export interface InventoryAudit {
  id: string;
  tenant_id: string;
  branch_id: string;
  status: AuditStatus;
  items_audited: number;
  items_adjusted: number;
  total_discrepancy_value: number;
  audited_by: string;
  notes: string | null;
  created_at: string;
  decided_at: string | null;
  branch_name?: string;
  audited_by_name?: string;
}

export interface InventoryAuditItem {
  id: string;
  audit_id: string;
  entity_type: "product" | "supply";
  entity_id: string;
  entity_name: string;
  entity_sku: string;
  cost_price: number;
  theoretical_stock: number;
  physical_stock: number;
  difference: number;
  cost_impact: number;
}

export interface AuditRow {
  entity_type: "product" | "supply";
  entity_id: string;
  entity_name: string;
  entity_sku: string;
  unit_of_measure: string;
  cost_price: number;
  theoretical_stock: number;
  physical_stock: number | null;
  difference: number;
  cost_impact: number;
  last_audited_at: string | null;
}

export interface AuditFilters {
  status?: AuditStatus;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface AuditKPIs {
  audited_last_30d: number;
  at_risk_count: number;
  last_audit_date: string | null;
  total_audits: number;
}
