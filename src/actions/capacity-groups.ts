"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/check-permission";
import {
  createCapacityGroupSchema,
  updateCapacityGroupSchema,
} from "@/lib/validators/capacity-group";
import type {
  CapacityGroup,
  CapacityGroupFilters,
  CapacityGroupKPIs,
} from "@/types/capacity-group";
import type { PaginatedResult } from "@/types/shared";

// ---------------------------------------------------------------------------
// List capacity groups (paginated)
// ---------------------------------------------------------------------------
export async function getCapacityGroups(
  filters: CapacityGroupFilters
): Promise<PaginatedResult<CapacityGroup>> {
  const { tenantId } = await requirePermission("reservas.capacidad", "view");
  const supabase = createAdminClient();

  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("capacity_groups")
    .select(`*, branches!inner(name)`, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.branch_id) query = query.eq("branch_id", filters.branch_id);
  if (filters.is_active !== undefined) query = query.eq("is_active", filters.is_active);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const total = count ?? 0;

  // Fetch member counts for each group
  const groupIds = (data || []).map((g) => g.id);
  let memberCounts: Record<string, number> = {};

  if (groupIds.length > 0) {
    const { data: members } = await supabase
      .from("capacity_group_members")
      .select("group_id")
      .in("group_id", groupIds);

    if (members) {
      memberCounts = members.reduce<Record<string, number>>((acc, m) => {
        acc[m.group_id] = (acc[m.group_id] || 0) + 1;
        return acc;
      }, {});
    }
  }

  const mapped = (data || []).map((g) => ({
    ...g,
    branch_name: (g.branches as unknown as { name: string }).name,
    member_count: memberCounts[g.id] || 0,
    branches: undefined,
  }));

  return {
    data: mapped as CapacityGroup[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get capacity group by ID (with members)
// ---------------------------------------------------------------------------
export async function getCapacityGroupById(id: string): Promise<CapacityGroup | null> {
  const { tenantId } = await requirePermission("reservas.capacidad", "view");
  const supabase = createAdminClient();

  const { data: group, error } = await supabase
    .from("capacity_groups")
    .select(`*, branches!inner(name)`)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !group) return null;

  // Fetch members with schedule info
  const { data: members } = await supabase
    .from("capacity_group_members")
    .select(`*, service_schedules!inner(interval_minutes, products!inner(name))`)
    .eq("group_id", id);

  const mappedMembers = (members || []).map((m) => {
    const schedule = m.service_schedules as unknown as {
      interval_minutes: number;
      products: { name: string };
    };
    return {
      id: m.id,
      group_id: m.group_id,
      schedule_id: m.schedule_id,
      created_at: m.created_at,
      product_name: schedule.products.name,
      interval_minutes: schedule.interval_minutes,
    };
  });

  return {
    ...group,
    branch_name: (group.branches as unknown as { name: string }).name,
    member_count: mappedMembers.length,
    members: mappedMembers,
    branches: undefined,
  } as CapacityGroup;
}

// ---------------------------------------------------------------------------
// Create capacity group
// ---------------------------------------------------------------------------
export async function createCapacityGroup(input: Record<string, unknown>) {
  const { tenantId } = await requirePermission("reservas.capacidad", "create");
  const supabase = createAdminClient();
  const validated = createCapacityGroupSchema.parse(input);

  // Validate: all schedules must be in the same branch
  const { data: schedules, error: schedError } = await supabase
    .from("service_schedules")
    .select("id, branch_id")
    .in("id", validated.schedule_ids);

  if (schedError) throw new Error(schedError.message);
  if (!schedules || schedules.length !== validated.schedule_ids.length) {
    throw new Error("Uno o mas horarios no existen");
  }

  const wrongBranch = schedules.find((s) => s.branch_id !== validated.branch_id);
  if (wrongBranch) {
    throw new Error("Todos los horarios deben pertenecer a la misma sede seleccionada");
  }

  // Validate: schedules must not already belong to another group
  const { data: existing } = await supabase
    .from("capacity_group_members")
    .select("schedule_id, group_id")
    .in("schedule_id", validated.schedule_ids);

  if (existing && existing.length > 0) {
    throw new Error("Uno o mas horarios ya pertenecen a otro grupo de capacidad");
  }

  // Insert the group
  const { data: group, error: insertError } = await supabase
    .from("capacity_groups")
    .insert({
      tenant_id: tenantId,
      branch_id: validated.branch_id,
      name: validated.name,
      shared_capacity: validated.shared_capacity,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  // Insert members
  const memberRows = validated.schedule_ids.map((schedule_id) => ({
    group_id: group.id,
    schedule_id,
  }));

  const { error: memberError } = await supabase
    .from("capacity_group_members")
    .insert(memberRows);

  if (memberError) throw new Error(memberError.message);

  revalidatePath("/reservas/capacidad");
  return { success: true, id: group.id };
}

// ---------------------------------------------------------------------------
// Update capacity group
// ---------------------------------------------------------------------------
export async function updateCapacityGroup(id: string, input: Record<string, unknown>) {
  const { tenantId } = await requirePermission("reservas.capacidad", "edit");
  const supabase = createAdminClient();
  const validated = updateCapacityGroupSchema.parse(input);

  // Get current group to find its branch_id
  const { data: currentGroup } = await supabase
    .from("capacity_groups")
    .select("branch_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!currentGroup) throw new Error("Grupo no encontrado");

  // Update group fields
  const updateData: Record<string, unknown> = {};
  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.shared_capacity !== undefined) updateData.shared_capacity = validated.shared_capacity;
  if (validated.is_active !== undefined) updateData.is_active = validated.is_active;

  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase
      .from("capacity_groups")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
  }

  // Replace members if provided
  if (validated.schedule_ids) {
    // Validate: all schedules must be in the same branch
    const { data: schedules } = await supabase
      .from("service_schedules")
      .select("id, branch_id")
      .in("id", validated.schedule_ids);

    if (!schedules || schedules.length !== validated.schedule_ids.length) {
      throw new Error("Uno o mas horarios no existen");
    }

    const wrongBranch = schedules.find((s) => s.branch_id !== currentGroup.branch_id);
    if (wrongBranch) {
      throw new Error("Todos los horarios deben pertenecer a la sede del grupo");
    }

    // Validate: schedules must not belong to another group (excluding this one)
    const { data: existing } = await supabase
      .from("capacity_group_members")
      .select("schedule_id, group_id")
      .in("schedule_id", validated.schedule_ids)
      .neq("group_id", id);

    if (existing && existing.length > 0) {
      throw new Error("Uno o mas horarios ya pertenecen a otro grupo de capacidad");
    }

    // Delete old members
    await supabase
      .from("capacity_group_members")
      .delete()
      .eq("group_id", id);

    // Insert new members
    const memberRows = validated.schedule_ids.map((schedule_id) => ({
      group_id: id,
      schedule_id,
    }));

    const { error: memberError } = await supabase
      .from("capacity_group_members")
      .insert(memberRows);

    if (memberError) throw new Error(memberError.message);
  }

  revalidatePath("/reservas/capacidad");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete capacity group
// ---------------------------------------------------------------------------
export async function deleteCapacityGroup(id: string) {
  const { tenantId } = await requirePermission("reservas.capacidad", "delete");
  const supabase = createAdminClient();

  // Delete members first (cascade should handle this, but explicit is safer)
  await supabase
    .from("capacity_group_members")
    .delete()
    .eq("group_id", id);

  const { error } = await supabase
    .from("capacity_groups")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  revalidatePath("/reservas/capacidad");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Get available schedules for a group (not in any group, or in this group)
// ---------------------------------------------------------------------------
export async function getAvailableSchedulesForGroup(
  branchId: string,
  excludeGroupId?: string
) {
  const { tenantId } = await requirePermission("reservas.capacidad", "view");
  const supabase = createAdminClient();

  // Get all active schedules for the branch
  const { data: schedules, error } = await supabase
    .from("service_schedules")
    .select(`id, interval_minutes, is_active, products!inner(name)`)
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!schedules || schedules.length === 0) return [];

  // Get all schedules that are already in a group
  const { data: usedMembers } = await supabase
    .from("capacity_group_members")
    .select("schedule_id, group_id");

  const usedMap = new Map<string, string>();
  (usedMembers || []).forEach((m) => usedMap.set(m.schedule_id, m.group_id));

  // Filter: keep schedules that are either free or belong to the excluded group
  const available = schedules
    .filter((s) => {
      const assignedGroup = usedMap.get(s.id);
      if (!assignedGroup) return true; // not in any group
      if (excludeGroupId && assignedGroup === excludeGroupId) return true; // in the current group being edited
      return false;
    })
    .map((s) => ({
      id: s.id,
      product_name: (s.products as unknown as { name: string }).name,
      interval_minutes: s.interval_minutes,
    }));

  return available;
}

// ---------------------------------------------------------------------------
// Capacity Group KPIs
// ---------------------------------------------------------------------------
export async function getCapacityGroupKPIs(): Promise<CapacityGroupKPIs> {
  await requirePermission("reservas.capacidad", "view");
  const { tenantId } = await requirePermission("reservas.capacidad", "view");
  const supabase = createAdminClient();

  // Total active groups
  const { count: totalGroups } = await supabase
    .from("capacity_groups")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  // Total linked schedules
  const { data: allGroups } = await supabase
    .from("capacity_groups")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  let linkedSchedules = 0;
  if (allGroups && allGroups.length > 0) {
    const groupIds = allGroups.map((g) => g.id);
    const { count: memberCount } = await supabase
      .from("capacity_group_members")
      .select("id", { count: "exact", head: true })
      .in("group_id", groupIds);
    linkedSchedules = memberCount ?? 0;
  }

  // Average capacity
  const { data: capacities } = await supabase
    .from("capacity_groups")
    .select("shared_capacity")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  let avgCapacity = 0;
  if (capacities && capacities.length > 0) {
    const sum = capacities.reduce((acc, g) => acc + g.shared_capacity, 0);
    avgCapacity = Math.round(sum / capacities.length);
  }

  return {
    total_groups: totalGroups ?? 0,
    linked_schedules: linkedSchedules,
    avg_capacity: avgCapacity,
  };
}
