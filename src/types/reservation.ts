// ---------------------------------------------------------------------------
// Reservation & Schedule types for POI ERP
// ---------------------------------------------------------------------------

// --- Schedule Types ---

export interface ServiceSchedule {
  id: string;
  tenant_id: string;
  product_id: string;
  branch_id: string;
  name: string | null;
  interval_minutes: number;
  default_capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  product_name?: string;
  branch_name?: string;
}

export interface ScheduleTimeRange {
  id: string;
  schedule_id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  start_time: string;  // "HH:mm:ss"
  end_time: string;
  capacity_override: number | null;
  created_at: string;
}

export interface ScheduleWithRanges extends ServiceSchedule {
  time_ranges: ScheduleTimeRange[];
}

export interface TimeSlot {
  slot_start: string;  // "HH:mm:ss"
  slot_end: string;
  capacity: number;
  reserved_count: number;
  available: number;
}

export interface DayScheduleSummary {
  date: string;        // "YYYY-MM-DD"
  total_capacity: number;
  total_booked: number;
  occupancy_percent: number;
}

// --- Reservation Types ---

export type ReservationStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export interface Reservation {
  id: string;
  tenant_id: string;
  schedule_id: string;
  product_id: string;
  branch_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  reservation_date: string;
  slot_start: string;
  slot_end: string;
  quantity: number;
  status: ReservationStatus;
  customer_name: string | null;
  notes: string | null;
  created_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  access_code: string | null;
  entries_used: number;
  checked_in_at: string | null;
  // Joined
  product_name?: string;
  branch_name?: string;
  customer_document_number?: string;
}

// --- Filter Types ---

export interface ScheduleFilters {
  product_id?: string;
  branch_id?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}

export interface ReservationFilters {
  product_id?: string;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  status?: ReservationStatus;
  search?: string; // customer name/document
  page?: number;
  page_size?: number;
}

// --- KPI Types ---

export interface ReservationKPIs {
  today_count: number;
  week_count: number;
  avg_occupancy_percent: number;
  top_service_name: string | null;
  services_with_schedule: number;
  services_without_schedule: number;
}

// --- Form Input Types ---

export interface TimeRangeInput {
  start_time: string;  // "HH:mm"
  end_time: string;
  capacity_override?: number | null;
}

export interface CreateScheduleInput {
  product_id: string;
  branch_id: string;
  name?: string;
  interval_minutes: number;
  default_capacity: number;
  days_of_week: number[];     // [1, 2, 3, 4, 5] = Mon-Fri
  time_ranges: TimeRangeInput[];
}

export interface UpdateScheduleInput extends Partial<CreateScheduleInput> {
  is_active?: boolean;
}

export interface CreateReservationInput {
  product_id: string;
  branch_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  invoice_id?: string | null;
  reservation_date: string;
  slot_start: string;
  slot_end: string;
  quantity: number;
  notes?: string | null;
}
