"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  factConfigSchema,
  invoiceSeriesSchema,
  cashRegisterSchema,
  factUserAssignmentSchema,
  cashRegisterEditSchema,
  invoiceSeriesEditSchema,
  factUserEditSchema,
} from "@/lib/validators/fact-config";
import type {
  FactConfig,
  CashRegisterListItem,
  InvoiceSeriesListItem,
  FactUserListItem,
} from "@/types/invoice";
import { notifyModuleAction } from "@/actions/notifications";
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
// Fact Config (no approval needed — direct save)
// ---------------------------------------------------------------------------

export async function getFactConfig(): Promise<FactConfig | null> {
  const { supabase, tenantId } = await getTenantId();
  const { data } = await supabase
    .from("fact_config")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();
  return data as FactConfig | null;
}

export async function saveFactConfig(input: unknown) {
  const parsed = factConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId;
  try {
    ({ supabase, tenantId } = await requirePermission("config.poi_fact", "edit"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const { data: existing } = await supabase
    .from("fact_config")
    .select("id")
    .eq("tenant_id", tenantId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("fact_config")
      .update({ ...parsed.data, api_token: parsed.data.api_token || null })
      .eq("tenant_id", tenantId);
    if (error) return { success: false as const, error: error.message };
  } else {
    const { error } = await supabase
      .from("fact_config")
      .insert({ ...parsed.data, tenant_id: tenantId, api_token: parsed.data.api_token || null, is_active: true });
    if (error) return { success: false as const, error: error.message };
  }

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Invoice Series
// ---------------------------------------------------------------------------

export async function getInvoiceSeries(): Promise<InvoiceSeriesListItem[]> {
  const { supabase, tenantId } = await getTenantId();
  const { data, error } = await supabase
    .from("invoice_series")
    .select("*, cash_registers(name, branches(name))")
    .eq("tenant_id", tenantId)
    .order("series_code");

  if (error) throw new Error(error.message);

  return (data || []).map((s) => {
    const cr = s.cash_registers as unknown as { name: string; branches: { name: string } | null } | null;
    return {
      ...s,
      branch_name: cr?.branches?.name ?? null,
      cash_register_name: cr?.name ?? null,
    };
  }) as unknown as InvoiceSeriesListItem[];
}

export async function createInvoiceSeries(input: unknown) {
  const parsed = invoiceSeriesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("config.poi_fact", "create"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
  const { cash_register_id, ...rest } = parsed.data;

  // SUNAT sequential validation: extract prefix and number
  const code = parsed.data.series_code;
  const prefixMatch = code.match(/^([A-Z]+)(\d+)$/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const num = parseInt(prefixMatch[2], 10);

    if (num > 1) {
      const prevNum = String(num - 1).padStart(code.length - prefix.length, "0");
      const prevCode = `${prefix}${prevNum}`;

      const { data: prevSeries } = await supabase
        .from("invoice_series")
        .select("id, is_active")
        .eq("tenant_id", tenantId)
        .eq("series_code", prevCode)
        .single();

      if (!prevSeries || !prevSeries.is_active) {
        return {
          success: false as const,
          error: `Debe existir la serie ${prevCode} activa (aprobada) antes de crear ${code}`,
        };
      }
    }
  }

  const { data: series, error } = await supabase
    .from("invoice_series")
    .insert({
      ...rest,
      tenant_id: tenantId,
      cash_register_id: cash_register_id || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) return { success: false as const, error: error.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Nueva serie de documentos",
    message: `Serie "${parsed.data.series_code}" (${parsed.data.document_type}) creada`,
    resourceType: "invoice_series",
    resourceId: series!.id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

export async function updateInvoiceSeries(id: string, input: unknown) {
  const parsed = invoiceSeriesEditSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase, tenantId, userId } = await getTenantId();

  const { data: existing } = await supabase
    .from("invoice_series")
    .select("series_code, document_type")
    .eq("id", id)
    .single();

  if (!existing) return { success: false as const, error: "Serie no encontrada" };

  const { error: updateError } = await supabase
    .from("invoice_series")
    .update({ cash_register_id: parsed.data.cash_register_id })
    .eq("id", id);

  if (updateError) return { success: false as const, error: updateError.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Serie de documentos actualizada",
    message: `Serie "${existing.series_code}" actualizada`,
    resourceType: "invoice_series",
    resourceId: id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

export async function deleteInvoiceSeries(id: string) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("config.poi_fact", "delete"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const { data: series } = await supabase
    .from("invoice_series")
    .select("series_code, document_type")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("invoice_series")
    .delete()
    .eq("id", id);

  if (error) return { success: false as const, error: error.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Serie de documentos eliminada",
    message: `Serie "${series?.series_code || id}" eliminada`,
    resourceType: "invoice_series",
    resourceId: id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Cash Registers
// ---------------------------------------------------------------------------

export async function getCashRegisters(): Promise<CashRegisterListItem[]> {
  const { supabase, tenantId } = await getTenantId();
  const { data, error } = await supabase
    .from("cash_registers")
    .select("*, branches(name)")
    .eq("tenant_id", tenantId)
    .order("code");

  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    ...r,
    branch_name: (r.branches as unknown as { name: string })?.name ?? null,
    is_open: !!r.current_opening_id,
  })) as unknown as CashRegisterListItem[];
}

export async function createCashRegister(input: unknown) {
  const parsed = cashRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("config.poi_fact", "create"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const { data: codeResult, error: codeError } = await supabase.rpc("fn_generate_cash_register_code", {
    p_tenant_id: tenantId,
  });
  if (codeError || !codeResult) {
    return {
      success: false as const,
      error: `No se pudo generar el código de la caja registradora: ${codeError?.message ?? "respuesta vacía del servidor"}`,
    };
  }

  const { data: register, error } = await supabase
    .from("cash_registers")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      code: codeResult,
      branch_id: parsed.data.branch_id || null,
      is_active: true,
    })
    .select("id, code")
    .single();

  if (error) return { success: false as const, error: error.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Nueva caja registradora",
    message: `Caja "${parsed.data.name}" creada`,
    resourceType: "cash_register",
    resourceId: register!.id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

export async function updateCashRegister(id: string, input: unknown) {
  const parsed = cashRegisterEditSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase, tenantId, userId } = await getTenantId();

  const { data: existing } = await supabase
    .from("cash_registers")
    .select("name, code")
    .eq("id", id)
    .single();

  if (!existing) return { success: false as const, error: "Caja no encontrada" };

  const { error: updateError } = await supabase
    .from("cash_registers")
    .update({
      name: parsed.data.name,
      branch_id: parsed.data.branch_id,
    })
    .eq("id", id);

  if (updateError) return { success: false as const, error: updateError.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Caja registradora actualizada",
    message: `Caja "${parsed.data.name}" actualizada`,
    resourceType: "cash_register",
    resourceId: id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

export async function deleteCashRegister(id: string) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission("config.poi_fact", "delete"));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const { data: register } = await supabase
    .from("cash_registers")
    .select("name, code")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("cash_registers")
    .delete()
    .eq("id", id);

  if (error) return { success: false as const, error: error.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Caja registradora eliminada",
    message: `Caja "${register?.name || id}" eliminada`,
    resourceType: "cash_register",
    resourceId: id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Fact User Assignments
// ---------------------------------------------------------------------------

export async function getFactUsers(): Promise<FactUserListItem[]> {
  const { supabase, tenantId } = await getTenantId();

  const { data, error } = await supabase
    .from("fact_user_assignments")
    .select("*, cash_registers(name)")
    .eq("tenant_id", tenantId)
    .not("cash_register_id", "is", null)
    .order("created_at");

  if (error) throw new Error(error.message);

  const userIds = (data || []).map((d) => d.user_id);
  const userMap: Record<string, { email: string; name: string }> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    profiles?.forEach((p) => {
      userMap[p.id] = {
        email: p.email ?? "",
        name: p.full_name || p.id,
      };
    });
  }

  return (data || []).map((d) => ({
    ...d,
    user_email: userMap[d.user_id]?.email ?? "",
    user_name: userMap[d.user_id]?.name ?? d.user_id,
    cash_register_name: (d.cash_registers as unknown as { name: string })?.name ?? null,
  })) as unknown as FactUserListItem[];
}

export async function createFactUserAssignment(input: unknown) {
  const parsed = factUserAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase, tenantId, userId } = await getTenantId();

  // Get user name for the notification message
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", parsed.data.user_id)
    .single();

  const userName = targetProfile?.full_name || targetProfile?.email || parsed.data.user_id;

  // Try UPDATE first — preserves pin_code (managed in /config/usuarios).
  // Only falls back to INSERT if no row exists yet.
  const { data: updated } = await supabase
    .from("fact_user_assignments")
    .update({
      cash_register_id: parsed.data.cash_register_id,
      is_active: true,
    })
    .eq("tenant_id", tenantId)
    .eq("user_id", parsed.data.user_id)
    .select("id")
    .single();

  let assignment = updated;

  if (!assignment) {
    // Get existing PIN if user has one (row may exist with cash_register_id = NULL)
    const { data: existing } = await supabase
      .from("fact_user_assignments")
      .select("pin_code")
      .eq("tenant_id", tenantId)
      .eq("user_id", parsed.data.user_id)
      .maybeSingle();

    const { data: inserted, error: insertError } = await supabase
      .from("fact_user_assignments")
      .insert({
        tenant_id: tenantId,
        user_id: parsed.data.user_id,
        cash_register_id: parsed.data.cash_register_id,
        pin_code: existing?.pin_code || null,
        is_active: true,
      })
      .select("id")
      .single();
    if (insertError) return { success: false as const, error: insertError.message };
    assignment = inserted;
  }

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Cajero asignado a caja",
    message: `"${userName}" asignado a caja registradora`,
    resourceType: "fact_user_assignment",
    resourceId: assignment!.id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

export async function updateFactUserAssignment(id: string, input: unknown) {
  const parsed = factUserEditSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.flatten().fieldErrors };
  }

  const { supabase, tenantId, userId } = await getTenantId();

  // Get current assignment details
  const { data: assignment } = await supabase
    .from("fact_user_assignments")
    .select("user_id")
    .eq("id", id)
    .single();

  if (!assignment) return { success: false as const, error: "Asignacion no encontrada" };

  let userName = id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", assignment.user_id)
    .single();
  userName = profile?.full_name || assignment.user_id;

  // Only update cash_register_id — PIN is managed in /config/usuarios
  const { error: updateError } = await supabase
    .from("fact_user_assignments")
    .update({
      cash_register_id: parsed.data.cash_register_id,
    })
    .eq("id", id);

  if (updateError) return { success: false as const, error: updateError.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Asignacion Fact actualizada",
    message: `Asignacion de "${userName}" actualizada`,
    resourceType: "fact_user_assignment",
    resourceId: id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

export async function deleteFactUserAssignment(id: string) {
  const { supabase, tenantId, userId } = await getTenantId();

  const { data: assignment } = await supabase
    .from("fact_user_assignments")
    .select("user_id")
    .eq("id", id)
    .single();

  let userName = id;
  if (assignment?.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", assignment.user_id)
      .single();
    userName = profile?.full_name || assignment.user_id;
  }

  // Clear register assignment but preserve PIN (managed in /config/usuarios)
  const { error } = await supabase
    .from("fact_user_assignments")
    .update({ cash_register_id: null })
    .eq("id", id);

  if (error) return { success: false as const, error: error.message };

  await notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["config.poi_fact"],
    title: "Acceso a Fact revocado",
    message: `Acceso de "${userName}" a POI Fact revocado`,
    resourceType: "fact_user_assignment",
    resourceId: id,
    type: "info",
  });

  revalidatePath("/config/poi-fact");
  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Employee selector — active employees with auth accounts
// ---------------------------------------------------------------------------

export async function getEmployeesForFactAssignment(): Promise<
  { user_id: string; employee_name: string; email: string }[]
> {
  const { supabase, tenantId } = await getTenantId();

  // Get active profiles (users) for the tenant
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("first_name");

  if (error) throw new Error(error.message);
  if (!profiles || profiles.length === 0) return [];

  // Exclude users who already have a cash register assigned
  const { data: assigned } = await supabase
    .from("fact_user_assignments")
    .select("user_id, cash_register_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const assignedWithRegister = new Set(
    (assigned || [])
      .filter((a: { cash_register_id: string | null }) => a.cash_register_id !== null)
      .map((a: { user_id: string }) => a.user_id)
  );

  return profiles
    .filter((p) => !assignedWithRegister.has(p.id))
    .map((p) => ({
      user_id: p.id,
      employee_name: `${p.first_name} ${p.last_name}`.trim(),
      email: p.email,
    }));
}

