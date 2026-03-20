// --------------------------------------------------------------------------
// Core database types for POI ERP
// --------------------------------------------------------------------------

export type AppRole = "gerente_general" | "admin" | "rrhh" | "jefe_area" | "empleado"

export interface Tenant {
  id: string
  name: string
  slug: string
  ruc: string | null
  razon_social: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Cargo = "gerente" | "supervisor" | "cajero" | "control_acceso"

export interface Profile {
  id: string
  tenant_id: string
  email: string
  first_name: string
  last_name: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  cargo: Cargo
  is_owner: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserPermission {
  id: string
  user_id: string
  tenant_id: string
  module_code: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export interface Branch {
  id: string
  tenant_id: string
  name: string
  address: string | null
  phone: string | null
  manager_id: string | null // references profiles.id
  is_active: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface Product {
  id: string
  tenant_id: string
  sku: string
  name: string
  description: string | null
  type: "product" | "service"
  unit: string
  price: number
  cost: number | null
  stock: number
  min_stock: number | null
  max_stock: number | null
  barcode: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductCategory {
  id: string
  tenant_id: string
  name: string
  description: string | null
  parent_id: string | null
  created_at: string
}

export interface ProductTag {
  id: string
  tenant_id: string
  name: string
  color: string | null
  created_at: string
}

export interface ProductCategoryAssignment {
  id: string
  product_id: string
  category_id: string
}

export interface ProductTagAssignment {
  id: string
  product_id: string
  tag_id: string
}

// ---------------------------------------------------------------------------
// Supplies
// ---------------------------------------------------------------------------

export interface Supply {
  id: string
  tenant_id: string
  sku: string
  name: string
  description: string | null
  unit: string
  cost: number | null
  stock: number
  min_stock: number | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SupplyCategoryAssignment {
  id: string
  supply_id: string
  category_id: string
}

export interface SupplyTagAssignment {
  id: string
  supply_id: string
  tag_id: string
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export interface RecipeItem {
  id: string
  product_id: string
  supply_id: string
  quantity: number
  unit: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Stock & Inventory
// ---------------------------------------------------------------------------

export interface InventoryMovement {
  id: string
  tenant_id: string
  product_id: string | null
  supply_id: string | null
  branch_id: string | null
  type: "entry" | "exit" | "transfer" | "adjustment"
  quantity: number
  reason: string | null
  notes: string | null
  created_by: string
  created_at: string
}

export interface InventoryAudit {
  id: string
  tenant_id: string
  branch_id: string | null
  auditor_id: string
  status: "in_progress" | "completed" | "cancelled"
  notes: string | null
  started_at: string
  completed_at: string | null
  created_at: string
}

export interface InventoryAuditItem {
  id: string
  audit_id: string
  product_id: string | null
  supply_id: string | null
  expected_quantity: number
  actual_quantity: number
  difference: number
  notes: string | null
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export interface Promotion {
  id: string
  tenant_id: string
  name: string
  description: string | null
  type: "percentage" | "fixed" | "bogo" | "bundle"
  value: number | null
  min_purchase: number | null
  max_discount: number | null
  start_date: string
  end_date: string
  is_active: boolean
  max_uses: number | null
  current_uses: number
  created_at: string
  updated_at: string
}

export interface PromotionGroup {
  id: string
  promotion_id: string
  product_id: string
  quantity: number | null
  discount_value: number | null
}

export interface PromotionCategoryFilter {
  id: string
  promotion_id: string
  category_id: string
}

export interface PromotionTagFilter {
  id: string
  promotion_id: string
  tag_id: string
}

export interface PromotionUsage {
  id: string
  promotion_id: string
  invoice_id: string
  discount_amount: number
  used_at: string
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface Customer {
  id: string
  tenant_id: string
  document_type: "DNI" | "RUC" | "CE" | "PASAPORTE"
  document_number: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Cash Register
// ---------------------------------------------------------------------------

export interface CashRegister {
  id: string
  tenant_id: string
  branch_id: string
  name: string
  is_active: boolean
  petty_cash_amount: number
  created_at: string
  updated_at: string
}

export interface CashRegisterOpening {
  id: string
  cash_register_id: string
  tenant_id: string
  opened_by: string
  closed_by: string | null
  opening_amount: number
  closing_amount: number | null
  expected_amount: number | null
  difference: number | null
  status: "open" | "closed"
  opened_at: string
  closed_at: string | null
  notes: string | null
}

export interface CashRegisterMovement {
  id: string
  opening_id: string
  tenant_id: string
  type: "income" | "expense"
  amount: number
  description: string | null
  reason: string | null
  receipt_number: string | null
  created_by: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Invoicing
// ---------------------------------------------------------------------------

export interface InvoiceSeries {
  id: string
  tenant_id: string
  branch_id: string
  document_type: "boleta" | "factura" | "nota_credito" | "nota_debito"
  series: string
  current_number: number
  is_active: boolean
  created_at: string
}

export interface Invoice {
  id: string
  tenant_id: string
  branch_id: string
  series_id: string
  opening_id: string | null
  customer_id: string | null
  document_type: "boleta" | "factura" | "nota_credito" | "nota_debito"
  series: string
  number: number
  subtotal: number
  tax: number
  discount: number
  total: number
  payment_method: "cash" | "card" | "transfer" | "mixed"
  status: "issued" | "cancelled" | "voided"
  sunat_document_id: string | null
  notes: string | null
  issued_by: string
  issued_at: string
  cancelled_at: string | null
  created_at: string
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  product_id: string | null
  name: string
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  tax: number
  total: number
}

// ---------------------------------------------------------------------------
// Fact (POS) Config
// ---------------------------------------------------------------------------

export interface FactConfig {
  id: string
  tenant_id: string
  branch_id: string
  printer_type: string | null
  printer_port: string | null
  paper_width: number | null
  auto_print: boolean
  show_logo: boolean
  footer_text: string | null
  created_at: string
  updated_at: string
}

export interface FactUserAssignment {
  id: string
  tenant_id: string
  user_id: string
  branch_id: string
  cash_register_id: string | null
  is_active: boolean
  assigned_by: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationType = "info" | "warning" | "success" | "error"

export interface Notification {
  id: string
  tenant_id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  resource_type: string | null
  resource_id: string | null
  is_read: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string
  tenant_id: string
  user_id: string
  action: string
  resource: string
  resource_id: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}
