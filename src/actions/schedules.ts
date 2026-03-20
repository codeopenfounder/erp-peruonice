"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createScheduleSchema, updateScheduleSchema } from "@/lib/validators/reservation";
import type {
  ServiceSchedule,
  ScheduleWithRanges,
  ScheduleFilters,
  TimeSlot,
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
// List schedules
// ---------------------------------------------------------------------------
export async function getSchedules(
  filters: ScheduleFilters
): Promise<PaginatedResult<ServiceSchedule & { product_name: string; branch_name: string }>> {
  await requirePermission("reservas.horarios", "view");
  const { supabase, tenantId } = await getTenantId();
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("service_schedules")
    .select(
      `*, products!inner(name), branches!inner(name)`,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.product_id) query = query.eq("product_id", filters.product_id);
  if (filters.branch_id) query = query.eq("branch_id", filters.branch_id);
  if (filters.is_active !== undefined) query = query.eq("is_active", filters.is_active);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const total = count ?? 0;
  const mapped = (data || []).map((s) => ({
    ...s,
    product_name: (s.products as unknown as { name: string }).name,
    branch_name: (s.branches as unknown as { name: string }).name,
    products: undefined,
    branches: undefined,
  }));

  return {
    data: mapped as (ServiceSchedule & { product_name: string; branch_name: string })[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get schedule by ID with time ranges
// ---------------------------------------------------------------------------
export async function getScheduleById(id: string): Promise<ScheduleWithRanges | null> {
  await requirePermission("reservas.horarios", "view");
  const { supabase, tenantId } = await getTenantId();

  const { data: schedule, error } = await supabase
    .from("service_schedules")
    .select(`*, products!inner(name), branches!inner(name)`)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !schedule) return null;

  const { data: ranges } = await supabase
    .from("schedule_time_ranges")
    .select("*")
    .eq("schedule_id", id)
    .order("day_of_week")
    .order("start_time");

  return {
    ...schedule,
    product_name: (schedule.products as unknown as { name: string }).name,
    branch_name: (schedule.branches as unknown as { name: string }).name,
    time_ranges: ranges || [],
  } as ScheduleWithRanges;
}

// ---------------------------------------------------------------------------
// Get schedules for a specific product
// ---------------------------------------------------------------------------
export async function getSchedulesByProduct(productId: string): Promise<ScheduleWithRanges[]> {
  const { supabase, tenantId } = await getTenantId();

  const { data: schedules } = await supabase
    .from("service_schedules")
    .select(`*, branches!inner(name)`)
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("is_active", true);

  if (!schedules || schedules.length === 0) return [];

  const scheduleIds = schedules.map((s) => s.id);
  const { data: ranges } = await supabase
    .from("schedule_time_ranges")
    .select("*")
    .in("schedule_id", scheduleIds)
    .order("day_of_week")
    .order("start_time");

  const rangeMap: Record<string, typeof ranges> = {};
  (ranges || []).forEach((r) => {
    if (!rangeMap[r.schedule_id]) rangeMap[r.schedule_id] = [];
    rangeMap[r.schedule_id]!.push(r);
  });

  return schedules.map((s) => ({
    ...s,
    branch_name: (s.branches as unknown as { name: string }).name,
    time_ranges: rangeMap[s.id] || [],
  })) as ScheduleWithRanges[];
}

// ---------------------------------------------------------------------------
// Create schedule
// ---------------------------------------------------------------------------
export async function createSchedule(input: Record<string, unknown>) {
  const { supabase, tenantId, userId } = await requirePermission("reservas.horarios", "create");
  const validated = createScheduleSchema.parse(input);

  // Insert the schedule
  const { data: schedule, error } = await supabase
    .from("service_schedules")
    .insert({
      tenant_id: tenantId,
      product_id: validated.product_id,
      branch_id: validated.branch_id,
      name: validated.name || null,
      interval_minutes: validated.interval_minutes,
      default_capacity: validated.default_capacity,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Insert time ranges for each selected day x each time range
  const rangeRows = validated.days_of_week.flatMap((day) =>
    validated.time_ranges.map((range) => ({
      schedule_id: schedule.id,
      day_of_week: day,
      start_time: range.start_time,
      end_time: range.end_time,
      capacity_override: range.capacity_override ?? null,
    }))
  );

  if (rangeRows.length > 0) {
    const { error: rangeError } = await supabase
      .from("schedule_time_ranges")
      .insert(rangeRows);
    if (rangeError) throw new Error(rangeError.message);
  }

  // Mark product as schedulable
  await supabase
    .from("products")
    .update({ is_schedulable: true })
    .eq("id", validated.product_id);

  revalidatePath("/reservas/horarios");
  revalidatePath("/inventario/servicios");
  return { success: true, id: schedule.id };
}

// ---------------------------------------------------------------------------
// Update schedule
// ---------------------------------------------------------------------------
export async function updateSchedule(id: string, input: Record<string, unknown>) {
  const { supabase, tenantId } = await requirePermission("reservas.horarios", "edit");
  const validated = updateScheduleSchema.parse(input);

  // Update schedule fields
  const updateData: Record<string, unknown> = {};
  if (validated.name !== undefined) updateData.name = validated.name || null;
  if (validated.interval_minutes !== undefined) updateData.interval_minutes = validated.interval_minutes;
  if (validated.default_capacity !== undefined) updateData.default_capacity = validated.default_capacity;
  if (validated.is_active !== undefined) updateData.is_active = validated.is_active;

  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase
      .from("service_schedules")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
  }

  // Replace time ranges if provided
  if (validated.days_of_week && validated.time_ranges) {
    // Delete existing ranges
    await supabase
      .from("schedule_time_ranges")
      .delete()
      .eq("schedule_id", id);

    // Insert new ranges
    const rangeRows = validated.days_of_week.flatMap((day) =>
      validated.time_ranges!.map((range) => ({
        schedule_id: id,
        day_of_week: day,
        start_time: range.start_time,
        end_time: range.end_time,
        capacity_override: range.capacity_override ?? null,
      }))
    );

    if (rangeRows.length > 0) {
      const { error: rangeError } = await supabase
        .from("schedule_time_ranges")
        .insert(rangeRows);
      if (rangeError) throw new Error(rangeError.message);
    }
  }

  revalidatePath("/reservas/horarios");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete schedule
// ---------------------------------------------------------------------------
export async function deleteSchedule(id: string) {
  const { supabase, tenantId } = await requirePermission("reservas.horarios", "delete");

  // Get schedule info to update the product afterwards
  const { data: schedule } = await supabase
    .from("service_schedules")
    .select("product_id")
    .eq("id", id)
    .single();

  // Check for ANY reservations (all statuses — FK RESTRICT blocks deletion for any status)
  const { count } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("schedule_id", id);

  let softDeleted = false;

  if (count && count > 0) {
    // Soft-delete — cannot hard-delete due to FK RESTRICT on reservations
    const { error } = await supabase
      .from("service_schedules")
      .update({ is_active: false })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    softDeleted = true;
  } else {
    // Safe to hard-delete — no reservations reference this schedule
    await supabase.from("reservation_slot_counts").delete().eq("schedule_id", id);
    const { error } = await supabase
      .from("service_schedules")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
  }

  // Mark the product as no longer schedulable
  if (schedule?.product_id) {
    await supabase
      .from("products")
      .update({ is_schedulable: false })
      .eq("id", schedule.product_id);
  }

  revalidatePath("/reservas/horarios");
  revalidatePath("/inventario/servicios");
  return { success: true, softDeleted };
}

// ---------------------------------------------------------------------------
// Get available slots for a date
// ---------------------------------------------------------------------------
export async function getAvailableSlots(
  productId: string,
  branchId: string,
  date: string
): Promise<TimeSlot[]> {
  const { supabase, tenantId } = await getTenantId();

  const { data, error } = await supabase.rpc("fn_get_available_slots", {
    p_tenant_id: tenantId,
    p_product_id: productId,
    p_branch_id: branchId,
    p_date: date,
  });

  if (error) throw new Error(error.message);
  return (data || []) as TimeSlot[];
}

// ---------------------------------------------------------------------------
// Schedule KPIs
// ---------------------------------------------------------------------------
export async function getScheduleKPIs() {
  await requirePermission("reservas.horarios", "view");
  const { supabase, tenantId } = await getTenantId();

  // Count services with/without schedules
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
    services_with_schedule: withSchedule ?? 0,
    services_without_schedule: (totalServices ?? 0) - (withSchedule ?? 0),
    total_services: totalServices ?? 0,
  };
}
