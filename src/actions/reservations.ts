"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  slotStart: string,
  slotEnd?: string
): Promise<{ reservations: Reservation[]; groupReservations: (Reservation & { product_name?: string })[] }> {
  await requirePermission("reservas.reservas", "view");
  const { supabase, tenantId } = await getTenantId();
  const adminClient = createAdminClient();

  // Get direct reservations for this service+slot
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

  const reservations = (data || []).map((r) => ({
    ...r,
    customer_document_number: (r.customers as unknown as { document_number: string } | null)?.document_number ?? null,
    customers: undefined,
  })) as Reservation[];

  // Check if this service has a capacity group — if so, fetch overlapping reservations from other members
  let groupReservations: (Reservation & { product_name?: string })[] = [];

  // Find the schedule for this product+branch
  const { data: schedule } = await adminClient
    .from("service_schedules")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .single();

  if (schedule) {
    // Check if schedule is in a capacity group
    const { data: membership } = await adminClient
      .from("capacity_group_members")
      .select("group_id")
      .eq("schedule_id", schedule.id)
      .single();

    if (membership) {
      // Get all OTHER schedule IDs in the same group
      const { data: otherMembers } = await adminClient
        .from("capacity_group_members")
        .select("schedule_id")
        .eq("group_id", membership.group_id)
        .neq("schedule_id", schedule.id);

      const otherScheduleIds = (otherMembers || []).map((m) => m.schedule_id);

      if (otherScheduleIds.length > 0) {
        // Find reservations from other group members that OVERLAP with this slot
        const querySlotEnd = slotEnd || slotStart;
        const { data: otherRes } = await adminClient
          .from("reservations")
          .select(`*, products(name), customers(document_number)`)
          .eq("tenant_id", tenantId)
          .eq("reservation_date", date)
          .in("schedule_id", otherScheduleIds)
          .in("status", ["confirmed", "completed"])
          .lt("slot_start", querySlotEnd)
          .gt("slot_end", slotStart)
          .order("created_at", { ascending: true });

        groupReservations = (otherRes || []).map((r) => ({
          ...r,
          product_name: (r.products as unknown as { name: string } | null)?.name ?? undefined,
          customer_document_number: (r.customers as unknown as { document_number: string } | null)?.document_number ?? null,
          customers: undefined,
          products: undefined,
        })) as (Reservation & { product_name?: string })[];
      }
    }
  }

  return { reservations, groupReservations };
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
  const { tenantId } = await getTenantId();
  const adminClient = createAdminClient();

  // 1. Get active schedules (filtered by product/branch if specified)
  let schedQuery = adminClient
    .from("service_schedules")
    .select("id, product_id, branch_id, interval_minutes, default_capacity")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (productId) schedQuery = schedQuery.eq("product_id", productId);
  if (branchId) schedQuery = schedQuery.eq("branch_id", branchId);

  const { data: schedules } = await schedQuery;
  if (!schedules || schedules.length === 0) return [];

  const scheduleIds = schedules.map((s) => s.id);

  // 2. Get time ranges for these schedules
  const { data: timeRanges } = await adminClient
    .from("schedule_time_ranges")
    .select("schedule_id, day_of_week, start_time, end_time, capacity_override")
    .in("schedule_id", scheduleIds);

  // 3. Get actual reservations (booked counts) in the date range
  const { data: reservations } = await adminClient
    .from("reservations")
    .select("reservation_date, quantity, schedule_id")
    .eq("tenant_id", tenantId)
    .in("schedule_id", scheduleIds)
    .in("status", ["confirmed", "completed"])
    .gte("reservation_date", startDate)
    .lte("reservation_date", endDate);

  // 4. Build schedule lookup: schedule_id → { interval_minutes, default_capacity }
  const schedMap = new Map<string, { interval_minutes: number; default_capacity: number }>();
  schedules.forEach((s) => schedMap.set(s.id, { interval_minutes: s.interval_minutes, default_capacity: s.default_capacity }));

  // 5. Build time ranges per schedule+day_of_week
  const rangeMap = new Map<string, { start: string; end: string; cap: number | null }[]>();
  (timeRanges || []).forEach((tr) => {
    const key = `${tr.schedule_id}:${tr.day_of_week}`;
    if (!rangeMap.has(key)) rangeMap.set(key, []);
    rangeMap.get(key)!.push({ start: tr.start_time, end: tr.end_time, cap: tr.capacity_override });
  });

  // 6. Calculate theoretical capacity per day + actual booked
  const dayMap: Record<string, { capacity: number; booked: number }> = {};

  // For each date in the range, compute theoretical capacity from schedule definition
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const dow = d.getDay(); // 0=Sun

    let dayCapacity = 0;
    for (const sched of schedules) {
      const info = schedMap.get(sched.id)!;
      const ranges = rangeMap.get(`${sched.id}:${dow}`) || [];
      for (const range of ranges) {
        // Count slots in this time range
        const [sh, sm] = range.start.split(":").map(Number);
        const [eh, em] = range.end.split(":").map(Number);
        const rangeMinutes = (eh * 60 + em) - (sh * 60 + sm);
        const slotCount = Math.floor(rangeMinutes / info.interval_minutes);
        const capPerSlot = range.cap ?? info.default_capacity;
        dayCapacity += slotCount * capPerSlot;
      }
    }

    if (dayCapacity > 0) {
      if (!dayMap[dateStr]) dayMap[dateStr] = { capacity: dayCapacity, booked: 0 };
      else dayMap[dateStr].capacity = dayCapacity;
    }
  }

  // Add booked counts from actual reservations
  (reservations || []).forEach((r) => {
    const dateStr = r.reservation_date;
    if (!dayMap[dateStr]) dayMap[dateStr] = { capacity: 0, booked: 0 };
    dayMap[dateStr].booked += r.quantity;
  });

  return Object.entries(dayMap)
    .filter(([, stats]) => stats.capacity > 0 || stats.booked > 0)
    .map(([date, stats]) => ({
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
function getPeruDateStr(date?: Date): string {
  const d = date ?? new Date();
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const peru = new Date(utcMs - 5 * 3600000);
  const y = peru.getFullYear();
  const m = String(peru.getMonth() + 1).padStart(2, "0");
  const day = String(peru.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getReservationKPIs(): Promise<ReservationKPIs> {
  await requirePermission("reservas.reservas", "view");
  const { supabase, tenantId } = await getTenantId();

  const today = getPeruDateStr();
  const nextWeek = getPeruDateStr(new Date(Date.now() + 7 * 86400000));

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
