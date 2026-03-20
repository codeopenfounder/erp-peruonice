// --------------------------------------------------------------------------
// Branch (Sede / Sucursal) types for POI ERP
// --------------------------------------------------------------------------

export type BranchType =
  | "sede_principal"
  | "sucursal"
  | "oficina"
  | "almacen"
  | "planta";

export interface Branch {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: BranchType;
  is_main: boolean;
  is_active: boolean;
  address: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranchListItem extends Branch {
  manager_name?: string | null;
  employee_count?: number;
}

export interface BranchKPIs {
  total_branches: number;
  active_branches: number;
  total_capacity: number;
  employees_assigned: number;
}

export interface BranchFilters {
  search?: string;
  type?: BranchType;
  is_active?: boolean;
}

export interface CreateBranchInput {
  name: string;
  type: BranchType;
  is_main?: boolean;
  address?: string;
  department?: string;
  province?: string;
  district?: string;
  phone?: string;
  email?: string;
  manager_id?: string;
}

export type UpdateBranchInput = Partial<CreateBranchInput>;

export interface BranchSelectItem {
  id: string;
  name: string;
  code: string;
}
