// --------------------------------------------------------------------------
// Inventory Movement types for POI ERP
// --------------------------------------------------------------------------

export type InventoryMovementType =
  | "waste"
  | "shrinkage"
  | "staff_consumption"
  | "breakage"
  | "adjustment"
  | "transfer"
  | "income"
  | "outcome"
  | "sale"
  | "nc_return";

export type EntityType = "product" | "supply";

export type CortesiaReason =
  | "cliente_insatisfecho"
  | "falla_producto"
  | "autorizacion_gerencia"
  | "otro";

export interface InventoryMovement {
  id: string;
  tenant_id: string;
  entity_type: EntityType;
  entity_id: string;
  quantity: number;
  movement_type: InventoryMovementType;
  reason: string | null;
  notes: string | null;
  branch_id: string;
  supplier_ruc: string | null;
  invoice_code: string | null;
  invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  // Joined fields (optional on base, guaranteed on Detail)
  entity_name?: string | null;
  entity_sku?: string | null;
  branch_name?: string | null;
  created_by_name?: string | null;
  invoice_number?: string | null;
}

export interface InventoryMovementFilters {
  search?: string;
  entity_type?: EntityType;
  entity_id?: string;
  movement_type?: InventoryMovementType;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  time_from?: string;
  time_to?: string;
  page?: number;
  page_size?: number;
}

export interface MovementKPIs {
  total_movements: number;
  waste_count: number;
  shrinkage_count: number;
  adjustment_count: number;
  income_count: number;
  sale_count: number;
}

export const MOVEMENT_TYPE_CONFIG: Record<
  InventoryMovementType,
  { label: string; icon: string; color: string }
> = {
  waste: { label: "Merma", icon: "Trash2", color: "destructive" },
  shrinkage: { label: "Pérdida/Robo", icon: "Search", color: "orange" },
  staff_consumption: { label: "Consumo Personal", icon: "User", color: "blue" },
  breakage: { label: "Rotura", icon: "Zap", color: "amber" },
  adjustment: { label: "Ajuste", icon: "BarChart3", color: "gray" },
  transfer: { label: "Transferencia", icon: "ArrowLeftRight", color: "purple" },
  income: { label: "Ingreso", icon: "ArrowDown", color: "green" },
  outcome: { label: "Egreso", icon: "ArrowUp", color: "red" },
  sale: { label: "Venta", icon: "ShoppingCart", color: "emerald" },
  nc_return: { label: "Devolución NC", icon: "RotateCcw", color: "orange" },
};
