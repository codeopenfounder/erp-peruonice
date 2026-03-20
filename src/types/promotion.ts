// --------------------------------------------------------------------------
// Promotion types for POI ERP
// --------------------------------------------------------------------------

export type DiscountType = "percentage" | "fixed_amount";
export type PromotionAppliesTo = "all" | "products" | "services";

export type PromotionStatus = "active" | "scheduled" | "expired" | "depleted" | "inactive";

// --- Core Database Interfaces ---

export interface Promotion {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  applies_to: PromotionAppliesTo;
  min_purchase_amount: number | null;
  max_discount_amount: number | null;
  min_quantity: number | null;
  applies_every: number;
  stock: number | null;
  used_count: number;
  max_uses_per_customer: number | null;
  valid_from: string | null;
  valid_until: string | null;
  restricted_hour_from: string | null;
  restricted_hour_until: string | null;
  is_active: boolean;
  is_combo: boolean;
  combo_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionCategoryFilter {
  id: string;
  promotion_id: string;
  category_id: string;
}

export interface PromotionTagFilter {
  id: string;
  promotion_id: string;
  tag_id: string;
}

export interface PromotionBranchFilter {
  id: string;
  promotion_id: string;
  branch_id: string;
}

export interface PromotionComboItem {
  id: string;
  promotion_id: string;
  product_id: string;
  quantity: number;
  product_name?: string;
  product_sku?: string;
  product_price?: number;
}

export interface PromotionUsage {
  id: string;
  tenant_id: string;
  promotion_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  used_at: string;
}

// --- Derived Types ---

export interface PromotionListItem {
  id: string;
  code: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number;
  applies_to: PromotionAppliesTo;
  applies_every: number;
  stock: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  restricted_hour_from: string | null;
  restricted_hour_until: string | null;
  is_combo: boolean;
  combo_price: number | null;
  is_active: boolean;
  computed_status: PromotionStatus;
  category_count: number;
  tag_count: number;
  branch_count: number;
}

export interface PromotionDetail extends Promotion {
  branch_filters: (PromotionBranchFilter & { branch_name: string })[];
  category_filters: (PromotionCategoryFilter & { category_name: string })[];
  tag_filters: (PromotionTagFilter & { tag_name: string })[];
  combo_items: PromotionComboItem[];
}

export interface PromotionFilters {
  search?: string;
  discount_type?: DiscountType;
  applies_to?: PromotionAppliesTo;
  status?: PromotionStatus;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export interface PromotionKPIs {
  total_active: number;
  total_scheduled: number;
  total_expired: number;
  total_uses: number;
}

// --- Form Input Types ---

export interface CreatePromotionInput {
  code: string;
  name: string;
  description?: string;
  discount_type: DiscountType;
  discount_value: number;
  applies_to: PromotionAppliesTo;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  min_quantity?: number;
  applies_every?: number;
  stock?: number;
  max_uses_per_customer?: number;
  valid_from?: string;
  valid_until?: string;
  restricted_hour_from?: string;
  restricted_hour_until?: string;
  branch_ids: string[];
  category_ids: string[];
  tag_ids?: string[];
}

export interface UpdatePromotionInput extends Partial<CreatePromotionInput> {
  is_active?: boolean;
}
