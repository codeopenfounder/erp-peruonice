"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createBranchSchema,
  updateBranchSchema,
} from "@/lib/validators/branch";
import type {
  BranchListItem,
  BranchKPIs,
  BranchFilters,
  BranchSelectItem,
} from "@/types/branch";
import { notifyModuleAction, getActorName } from "./notifications";
import { requirePermission } from "@/lib/auth/check-permission";

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
// List branches
// ---------------------------------------------------------------------------
export async function getBranches(
  filters: BranchFilters = {},
): Promise<BranchListItem[]> {
  const { supabase } = await getTenantId();
  const { search, type, is_active } = filters;

  let query = supabase
    .from("branches")
    .select("*")
    .order("code", { ascending: true });

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,code.ilike.%${search}%,address.ilike.%${search}%`,
    );
  }
  if (type) query = query.eq("type", type);
  if (is_active !== undefined) query = query.eq("is_active", is_active);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Enrich with manager name and employee count
  const branches = data || [];
  const enriched: BranchListItem[] = [];

  for (const branch of branches) {
    let manager_name: string | null = null;
    if (branch.manager_id) {
      const { data: mgr } = await supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", branch.manager_id)
        .single();
      if (mgr) manager_name = `${mgr.first_name} ${mgr.last_name}`;
    }

    const { count } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branch.id)
      .eq("is_active", true);

    enriched.push({
      ...branch,
      manager_name,
      employee_count: count || 0,
    });
  }

  return enriched;
}

// ---------------------------------------------------------------------------
// Get branch KPIs
// ---------------------------------------------------------------------------
export async function getBranchKPIs(): Promise<BranchKPIs> {
  const { supabase } = await getTenantId();

  const [totalRes, activeRes, assignedRes] = await Promise.all([
    supabase
      .from("branches")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("branches")
      .select("max_capacity", { count: "exact" })
      .eq("is_active", true),
    supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .not("branch_id", "is", null)
      .eq("is_active", true),
  ]);

  // Sum capacities
  let totalCapacity = 0;
  if (activeRes.data) {
    totalCapacity = activeRes.data.reduce(
      (sum: number, b: any) => sum + (b.max_capacity || 0),
      0,
    );
  }

  return {
    total_branches: totalRes.count || 0,
    active_branches: activeRes.count || 0,
    total_capacity: totalCapacity,
    employees_assigned: assignedRes.count || 0,
  };
}

// ---------------------------------------------------------------------------
// Lightweight list for select dropdowns
// ---------------------------------------------------------------------------
export async function getBranchesForSelect(): Promise<BranchSelectItem[]> {
  const { supabase } = await getTenantId();

  const { data, error } = await supabase
    .from("branches")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error(error.message);
  return data || [];
}

// ---------------------------------------------------------------------------
// Create branch
// ---------------------------------------------------------------------------
export async function createBranch(input: unknown) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("config.sedes", "create"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const parsed = createBranchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;

  // Generate code
  const { data: codeResult, error: codeError } = await supabase.rpc("fn_generate_branch_code", {
    p_tenant_id: tenantId,
  });
  if (codeError || !codeResult) {
    return {
      success: false as const,
      error: `No se pudo generar el código de la sede: ${codeError?.message ?? "respuesta vacía del servidor"}`,
    };
  }
  const code = codeResult;

  const { error } = await supabase.from("branches").insert({
    tenant_id: tenantId,
    code,
    name: data.name,
    type: data.type,
    is_main: data.is_main ?? false,
    address: data.address || null,
    department: data.department || null,
    province: data.province || null,
    district: data.district || null,
    phone: data.phone || null,
    email: data.email || null,
    manager_id: data.manager_id || null,
    
  });

  if (error) {
    const actorName = await getActorName(supabase, userId);
    void notifyModuleAction({
      tenantId,
      actorId: userId,
      moduleCodes: ["negocio.sedes"],
      title: "Error al crear sede",
      message: `${actorName} intento crear la sede "${data.name}" pero ocurrio un error`,
      type: "error",
    }).catch(console.error);
    return { success: false as const, error: error.message };
  }

  const actorName = await getActorName(supabase, userId);
  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["negocio.sedes"],
    title: "Nueva sede creada",
    message: `${actorName} creó la sede "${data.name}"`,
    resourceType: "branch",
  }).catch(console.error);

  revalidatePath("/config/sedes");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Update branch
// ---------------------------------------------------------------------------
export async function updateBranch(id: string, input: unknown) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("config.sedes", "edit"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const parsed = updateBranchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    };
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updateData[key] = value === "" ? null : value;
    }
  }

  // Get branch name for notification
  const { data: branch } = await supabase
    .from("branches")
    .select("name")
    .eq("id", id)
    .single();
  const branchName = branch?.name || "sede";

  const { error } = await supabase
    .from("branches")
    .update(updateData)
    .eq("id", id);

  const actorName = await getActorName(supabase, userId);
  if (error) {
    void notifyModuleAction({
      tenantId,
      actorId: userId,
      moduleCodes: ["negocio.sedes"],
      title: "Error al actualizar sede",
      message: `${actorName} intento actualizar la sede "${branchName}" pero ocurrio un error`,
      type: "error",
    }).catch(console.error);
    return { success: false as const, error: error.message };
  }

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["negocio.sedes"],
    title: "Sede actualizada",
    message: `${actorName} actualizó la sede "${branchName}"`,
    resourceType: "branch",
    resourceId: id,
  }).catch(console.error);

  revalidatePath("/config/sedes");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Toggle active status
// ---------------------------------------------------------------------------
export async function toggleBranchStatus(id: string) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("config.sedes", "edit"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const { data: branch } = await supabase
    .from("branches")
    .select("is_active, name")
    .eq("id", id)
    .single();

  if (!branch) return { success: false as const, error: "Sede no encontrada" };

  const newState = !branch.is_active;
  const { error } = await supabase
    .from("branches")
    .update({ is_active: newState })
    .eq("id", id);

  const actorName = await getActorName(supabase, userId);
  const stateLabel = newState ? "activada" : "desactivada";

  if (error) {
    void notifyModuleAction({
      tenantId,
      actorId: userId,
      moduleCodes: ["negocio.sedes"],
      title: "Error al cambiar estado de sede",
      message: `${actorName} intento ${newState ? "activar" : "desactivar"} la sede "${branch.name}" pero ocurrio un error`,
      type: "error",
    }).catch(console.error);
    return { success: false as const, error: error.message };
  }

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["negocio.sedes"],
    title: `Sede ${stateLabel}`,
    message: `${actorName} ${stateLabel} la sede "${branch.name}"`,
    resourceType: "branch",
    resourceId: id,
  }).catch(console.error);

  revalidatePath("/config/sedes");
  return { success: true as const };
}
