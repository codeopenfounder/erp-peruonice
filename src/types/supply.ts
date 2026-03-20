// --------------------------------------------------------------------------
// Supply / Insumo types for POI ERP
// --------------------------------------------------------------------------

export type SupplyCurrency = "PEN" | "USD";

export interface Supply {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description: string | null;
  unit_of_measure: string;
  stock_quantity: number;
  min_stock: number | null;
  cost_price: number | null;
  currency: SupplyCurrency;
  branch_id: string | null;
  image_url: string | null;
  barcode: string | null;
  available_in_pos: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplyListItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit_of_measure: string;
  stock_quantity: number;
  min_stock: number | null;
  cost_price: number | null;
  currency: SupplyCurrency;
  branch_id: string | null;
  image_url: string | null;
  barcode: string | null;
  available_in_pos: boolean;
  is_active: boolean;
  categories: { id: string; name: string }[];
  tags: { id: string; name: string; color: string | null }[];
}

export interface SupplyDetail extends Supply {
  categories: { id: string; name: string; type: string }[];
  tags: { id: string; name: string; color: string | null; assignment_id: string }[];
  branch_name?: string;
}

export interface SupplyFilters {
  search?: string;
  category_id?: string;
  tag_id?: string;
  branch_id?: string;
  is_active?: boolean;
  available_in_pos?: boolean;
  page?: number;
  page_size?: number;
}

export interface SupplyKPIs {
  total_supplies: number;
  low_stock_count: number;
  out_of_stock_count: number;
  pos_enabled_count: number;
  total_value: number;
}
