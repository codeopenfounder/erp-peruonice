// ---------------------------------------------------------------------------
// Capacity Group types for POI ERP
// ---------------------------------------------------------------------------

export interface CapacityGroup {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  shared_capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  branch_name?: string;
  member_count?: number;
  members?: CapacityGroupMember[];
}

export interface CapacityGroupMember {
  id: string;
  group_id: string;
  schedule_id: string;
  created_at: string;
  // Joined
  product_name?: string;
  interval_minutes?: number;
}

// --- Filter Types ---

export interface CapacityGroupFilters {
  branch_id?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

// --- KPI Types ---

export interface CapacityGroupKPIs {
  total_groups: number;
  linked_schedules: number;
  avg_capacity: number;
}
