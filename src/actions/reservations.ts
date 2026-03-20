"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createReservationSchema } from "@/lib/validators/reservation";
import type {
  Reservation,
  ReservationFilters,
  ReservationKPIs,
  DayScheduleSummary,
} from "@/types/reservation";
import type { PaginatedResult } from "@/types/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getTenantId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) throw new Error("Sin tenant asignado");

  return { supabase, tenantId: profile.tenant_id, userId: user.id };
}

// ---------------------------------------------------------------------------
// List reservations (paginated)
// ---------------------------------------------------------------------------
export async function getReservations(
  filters: ReservationFilters
): Promise<PaginatedResult<Reservation>> {
  await requirePermission("reservas.reservas", "view");
  const { supabase, tenantId } = await getTenantId();
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("reservations")
    .select(
      `*, products!inner(name), branches!inner(name), customers(document_number)`,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("reservation_date", { ascending: false })
    .order("slot_start", { ascending: true })
    .range(from, to);

  if (filters.product_id) query = query.eq("product_id", filters.product_id);
  if (filters.branch_id) query = query.eq("branch_id", filters.branch_id);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.date_from) query = query.gte("reservation_date", filters.date_from);
  if (filters.date_to) query = query.lte("reservation_date", filters.date_to);
  if (filters.search) {
    query = query.or(`customer_name.ilike.%${filters.search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  const mapped = (data || []).map((r) => ({
    ...r,
    product_name: (r.products as unknown as { name: string }).name,
    branch_name: (r.branches as unknown as { name: string }).name,
    customer_document_number: (r.customers as unknown as { document_number: string } | null)?.document_number ?? null,
    products: undefined,
    branches: undefined,
    customers: undefined,
  }));

  return {
    data: mapped as Reservation[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get reservations for a specific slot
// ---------------------------------------------------------------------------
export async function getReservationsBySlot(
  productId: string,
  branchId: string,
  date: string,
  slotStart: string
): Promise<Reservation[]> {
  await requirePermission("reservas.reservas", "view");
  const { supabase, tenantId } = await getTenantId();

  const { data, error } = await supabase
    .from("reservations")
    .select(`*, customers(document_number)`)
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("branch_id", branchId)
    .eq("reservation_date", date)
    .eq("slot_start", slotStart)
    .in("status", ["confirmed", "completed"])
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    ...r,
    customer_document_number: (r.customers as unknown as { document_number: string } | null)?.document_number ?? null,
    customers: undefined,
  })) as Reservation[];
}

// ---------------------------------------------------------------------------
// Get reservation summaries by date range (for calendar month view)
// ---------------------------------------------------------------------------
export async function getReservationsByDateRange(
  productId: string | null,
  branchId: string | null,
  startDate: string,
  endDate: string
): Promise<DayScheduleSummary[]> {
  await requirePermission("reservas.reservas", "view");
  const { supabase, tenantId } = await getTenantId();

  let query = supabase
    .from("reservation_slot_counts")
    .select("slot_date, reserved_count, capacity, service_schedules!inner(product_id, branch_id)")
    .eq("tenant_id", tenantId)
    .gte("slot_date", startDate)
    .lte("slot_date", endDate);

  // Note: filtering through relation requires the join
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Group by date and aggregate
  const dayMap: Record<string, { capacity: number; booked: number }> = {};
  (data || []).forEach((row) => {
    const schedule = row.service_schedules as unknown as { product_id: string; branch_id: string };
    if (productId && schedule.product_id !== productId) return;
    if (branchId && schedule.branch_id !== branchId) return;

    const date = row.slot_date;
    if (!dayMap[date]) dayMap[date] = { capacity: 0, booked: 0 };
    dayMap[date].capacity += row.capacity;
    dayMap[date].booked += row.reserved_count;
  });

  return Object.entries(dayMap).map(([date, stats]) => ({
    date,
    total_capacity: stats.capacity,
    total_booked: stats.booked,
    occupancy_percent: stats.capacity > 0 ? Math.round((stats.booked / stats.capacity) * 100) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Create reservation (uses atomic function)
// ---------------------------------------------------------------------------
export async function createReservation(input: Record<string, unknown>) {
  const { supabase, tenantId, userId } = await requirePermission("reservas.reservas", "create");
  const validated = createReservationSchema.parse(input);

  const { data, error } = await supabase.rpc("fn_create_reservation", {
    p_tenant_id: tenantId,
    p_product_id: validated.product_id,
    p_branch_id: validated.branch_id,
    p_customer_id: validated.customer_id || null,
    p_customer_name: validated.customer_name || null,
    p_invoice_id: validated.invoice_id || null,
    p_date: validated.reservation_date,
    p_slot_start: validated.slot_start,
    p_slot_end: validated.slot_end,
    p_quantity: validated.quantity,
    p_created_by: userId,
    p_notes: validated.notes || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/reservas/reservas");
  return { success: true, id: data };
}

// ---------------------------------------------------------------------------
// Cancel reservation
// ---------------------------------------------------------------------------
export async function cancelReservation(id: string, reason?: string) {
  const { supabase, userId } = await requirePermission("reservas.reservas", "edit");

  const { error } = await supabase.rpc("fn_cancel_reservation", {
    p_reservation_id: id,
    p_cancelled_by: userId,
    p_reason: reason || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/reservas/reservas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Reservation KPIs
// ---------------------------------------------------------------------------
export async function getReservationKPIs(): Promise<ReservationKPIs> {
  await requirePermission("reservas.reservas", "view");
  const { supabase, tenantId } = await getTenantId();

  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  // Today's count
  const { count: todayCount } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("reservation_date", today)
    .eq("status", "confirmed");

  // Week count
  const { count: weekCount } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("reservation_date", today)
    .lte("reservation_date", nextWeek)
    .in("status", ["confirmed", "completed"]);

  // Average occupancy from slot counts (today)
  const { data: slotCounts } = await supabase
    .from("reservation_slot_counts")
    .select("reserved_count, capacity")
    .eq("tenant_id", tenantId)
    .eq("slot_date", today);

  let avgOccupancy = 0;
  if (slotCounts && slotCounts.length > 0) {
    const totalCap = slotCounts.reduce((s, r) => s + r.capacity, 0);
    const totalBooked = slotCounts.reduce((s, r) => s + r.reserved_count, 0);
    avgOccupancy = totalCap > 0 ? Math.round((totalBooked / totalCap) * 100) : 0;
  }

  // Top service (most reservations today)
  const { data: topService } = await supabase
    .from("reservations")
    .select("product_id, products!inner(name)")
    .eq("tenant_id", tenantId)
    .eq("reservation_date", today)
    .eq("status", "confirmed")
    .limit(1);

  // Services with/without schedule
  const { count: withSchedule } = await supabase
    .from("service_schedules")
    .select("product_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const { count: totalServices } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("type", "service")
    .eq("is_active", true);

  return {
    today_count: todayCount ?? 0,
    week_count: weekCount ?? 0,
    avg_occupancy_percent: avgOccupancy,
    top_service_name: topService?.[0]
      ? (topService[0].products as unknown as { name: string }).name
      : null,
    services_with_schedule: withSchedule ?? 0,
    services_without_schedule: (totalServices ?? 0) - (withSchedule ?? 0),
  };
}
