"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ActivityEntry {
  id: string;
  action: string;
  actor_name: string;
  description: string;
  changes?: { field: string; old: string; new: string }[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Field label mappings for human-readable diffs
// ---------------------------------------------------------------------------
const FIELD_LABELS: Record<string, string> = {
  first_name: "Nombre",
  last_name: "Apellido",
  document_type: "Tipo de documento",
  document_number: "Número de documento",
  birth_date: "Fecha de nacimiento",
  gender: "Genero",
  marital_status: "Estado civil",
  nationality: "Nacionalidad",
  address: "Direccion",
  phone: "Telefono",
  personal_email: "Email personal",
  corporate_email: "Email corporativo",
  hire_date: "Fecha de ingreso",
  area: "Area",
  position: "Cargo",
  base_salary: "Salario base",
  salary_type: "Tipo de salario",
  labor_regime: "Regimen laboral",
  pension_system: "Sistema de pensiones",
  pension_fund: "Fondo de pension",
  has_family_allowance: "Asignacion familiar",
  sctr: "SCTR",
  branch_id: "Sede",
  is_active: "Estado",
};

// ---------------------------------------------------------------------------
// Log audit entry (internal helper — uses admin client to bypass RLS)
// ---------------------------------------------------------------------------
export async function logAuditEntry(params: {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
}) {
  try {
    const adminClient = createAdminClient();
    await adminClient.from("audit_log").insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      action: params.action,
      resource: params.resource,
      resource_id: params.resourceId,
      old_data: params.oldData || null,
      new_data: params.newData || null,
    });
  } catch (err) {
    console.error("[logAuditEntry] error:", err);
  }
}

// ---------------------------------------------------------------------------
// Get employee activity log (timeline data)
// ---------------------------------------------------------------------------
export async function getEmployeeActivityLog(
  employeeId: string,
): Promise<ActivityEntry[]> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 1. Get audit_log entries for this employee (via admin to bypass RLS)
  const { data: auditEntries } = await adminClient
    .from("audit_log")
    .select("id, user_id, action, old_data, new_data, created_at")
    .eq("resource", "employee")
    .eq("resource_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(100);

  // 2. Collect unique user IDs to batch-resolve names
  const userIds = new Set<string>();
  (auditEntries || []).forEach((e) => { if (e.user_id) userIds.add(e.user_id); });

  const nameMap: Record<string, string> = {};
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...userIds]);
    (profiles || []).forEach((p) => { nameMap[p.id] = p.full_name || "Usuario"; });
  }

  const getName = (id: string | null) => (id ? nameMap[id] || "Usuario" : "Sistema");

  // 4. Build activity entries from audit_log
  const activities: ActivityEntry[] = [];

  for (const entry of auditEntries || []) {
    const actorName = getName(entry.user_id);
    const action = entry.action as string;

    let description = "";
    let changes: { field: string; old: string; new: string }[] | undefined;

    switch (action) {
      case "create":
        description = `${actorName} registró al empleado`;
        break;
      case "edit":
        description = `${actorName} editó la información`;
        if (entry.new_data && typeof entry.new_data === "object") {
          const diff = entry.new_data as Record<string, { old: unknown; new: unknown }>;
          changes = Object.entries(diff).map(([field, vals]) => ({
            field: FIELD_LABELS[field] || field,
            old: formatValue(field, vals?.old),
            new: formatValue(field, vals?.new),
          }));
          if (changes.length === 1) {
            description = `${actorName} editó ${changes[0].field.toLowerCase()}`;
          } else if (changes.length > 1) {
            description = `${actorName} editó ${changes.length} campos`;
          }
        }
        break;
      case "disable_requested":
        description = `${actorName} solicito la deshabilitacion`;
        break;
      case "enable_requested":
        description = `${actorName} solicito la habilitacion`;
        break;
      case "disabled":
        description = `${actorName} deshabilito al empleado`;
        break;
      case "enabled":
        description = `${actorName} habilitó al empleado`;
        break;
      case "account_created":
        description = `${actorName} creó la cuenta de acceso`;
        break;
      default:
        description = `${actorName} realizo: ${action}`;
    }

    activities.push({
      id: entry.id,
      action,
      actor_name: actorName,
      description,
      changes,
      created_at: entry.created_at,
    });
  }

  // 5. Sort all by date descending
  activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return activities;
}

// ---------------------------------------------------------------------------
// Format value for display
// ---------------------------------------------------------------------------
function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Si" : "No";
  if (field === "base_salary" && typeof value === "number") {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);
  }
  return String(value);
}
