// --------------------------------------------------------------------------
// Product & Inventory types for POI ERP
// --------------------------------------------------------------------------

// --- Status & Enum Types ---

export type ProductType = "product" | "service";
export type CategoryType = "product" | "service" | "both" | "supply";
export type TaxType = "gravado" | "exonerado" | "inafecto";
export type ProductCurrency = "PEN" | "USD";
export type ProductKind = "simple" | "composite";

// --- Core Database Interfaces ---

export interface ProductCategory {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
  type: CategoryType;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductTag {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  color: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  description: string | null;
  type: ProductType;
  product_kind: ProductKind;
  unit_price: number;
  cost_price: number | null;
  currency: ProductCurrency;
  tax_type: TaxType;
  igv_rate: number;
  stock_quantity: number;
  min_stock: number | null;
  unit_of_measure: string;
  barcode: string | null;
  branch_id: string | null;
  image_url: string | null;
  is_active: boolean;
  is_schedulable: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductTagAssignment {
  id: string;
  product_id: string;
  tag_id: string;
}

export interface RecipeItem {
  id: string;
  product_id: string;
  supply_id: string;
  quantity_needed: number;
  unit_of_measure: string;
  sort_order: number;
  created_at: string;
  // Joined fields
  supply_name?: string;
  supply_sku?: string;
  supply_stock?: number;
  supply_unit?: string;
}

// --- Derived / Composite Types ---

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  type: ProductType;
  product_kind: ProductKind;
  categories: { id: string; name: string }[];
  unit_price: number;
  cost_price: number | null;
  currency: ProductCurrency;
  tax_type: TaxType;
  igv_rate: number;
  stock_quantity: number;
  min_stock: number | null;
  barcode: string | null;
  branch_id: string | null;
  image_url: string | null;
  is_active: boolean;
  unit_of_measure: string;
  tags: { id: string; name: string; color: string | null }[];
}

export interface ProductDetail extends Product {
  categories: ProductCategory[];
  tags: (ProductTag & { assignment_id: string })[];
  branch_name?: string;
  recipe_items?: RecipeItem[];
}

export interface ProductFilters {
  search?: string;
  type?: ProductType;
  product_kind?: ProductKind;
  category_id?: string;
  tag_id?: string;
  branch_id?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export interface ProductKPIs {
  total_products: number;
  total_services: number;
  low_stock_count: number;
  out_of_stock_count: number;
  total_categories: number;
}

// --- Category with children ---

export interface CategoryWithTags extends ProductCategory {
  tags: ProductTag[];
  product_count: number;
  children: CategoryWithTags[];
}

// --- Stock Movement ---

/** @deprecated Use InventoryMovement from types/inventory-movement instead */
export interface StockMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  quantity: number;
  type: "initial" | "add" | "subtract" | "adjustment";
  supplier_ruc: string | null;
  invoice_code: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
}

// --- Form Input Types ---

export interface CreateProductInput {
  name: string;
  description?: string;
  type: ProductType;
  product_kind?: ProductKind;
  recipe_items?: { supply_id: string; quantity_needed: number; unit_of_measure: string }[];
  category_ids?: string[];
  unit_price: number;
  cost_price?: number;
  currency: ProductCurrency;
  tax_type: TaxType;
  igv_rate: number;
  stock_quantity: number;
  min_stock?: number;
  unit_of_measure: string;
  tag_ids?: string[];
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  is_active?: boolean;
}

export interface CreateCategoryInput {
  name: string;
  parent_id?: string;
  type: CategoryType;
  sort_order?: number;
}

export interface CreateTagInput {
  category_id: string;
  name: string;
  color?: string;
  sort_order?: number;
}
