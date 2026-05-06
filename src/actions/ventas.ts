"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { notifyModuleAction } from "@/actions/notifications";
import type {
  InvoiceKPIs,
  InvoiceListItem,
  InvoiceDetail,
  InvoiceFilters,
  CustomerListItem,
  CustomerFilters,
  CustomerKPIs,
} from "@/types/invoice";

export interface InvoicePdfPayload {
  invoice: InvoiceDetail;
  emisor: {
    ruc: string;
    razonSocial: string;
    direccion: string;
    logoUrl: string | null;
  };
}

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
// Invoice KPIs
// ---------------------------------------------------------------------------
export async function getInvoiceKPIs(date?: string): Promise<InvoiceKPIs> {
  const { supabase, tenantId } = await getTenantId();

  // Peru timezone date (UTC-5)
  const targetDate =
    date ||
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const dayStartUtc = `${targetDate}T05:00:00Z`;
  const nextDay = new Date(`${targetDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const dayEndUtc = `${nextDay.toISOString().split("T")[0]}T05:00:00Z`;

  const { data: invoices } = await supabase
    .from("invoices")
    .select("document_type, total, payment_method, status")
    .eq("tenant_id", tenantId)
    .gte("created_at", dayStartUtc)
    .lt("created_at", dayEndUtc)
    .neq("status", "voided");

  let totalSales = 0;
  let totalInvoices = 0;
  let facturas = 0;
  let boletas = 0;
  let notasCredito = 0;
  const byPayment: Record<string, number> = {};

  (invoices || []).forEach((inv) => {
    const amt = Number(inv.total);
    totalInvoices += 1;

    if (inv.document_type === "nota_credito") {
      notasCredito += 1;
      // Notas de credito reduce total sales
      totalSales -= amt;
    } else {
      totalSales += amt;
      if (inv.document_type === "factura") facturas += 1;
      if (inv.document_type === "boleta") boletas += 1;
    }

    if (inv.payment_method) {
      byPayment[inv.payment_method] =
        (byPayment[inv.payment_method] ?? 0) + amt;
    }
  });

  return {
    total_sales: totalSales,
    total_invoices: totalInvoices,
    facturas,
    boletas,
    notas_credito: notasCredito,
    by_payment: byPayment,
  };
}

// ---------------------------------------------------------------------------
// Invoices (paginated)
// ---------------------------------------------------------------------------
export async function getInvoices(
  filters: InvoiceFilters
): Promise<{ data: InvoiceListItem[]; total: number }> {
  const { supabase, tenantId } = await getTenantId();

  const page = filters.page ?? 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("invoices")
    .select(
      "id, document_type, correlative_number, series_id, issue_date, customer_name, customer_document_type, customer_document_number, total, status, payment_method, cash_register_id, created_at, reference_invoice_id, sunat_response_code, sunat_response_desc, sunat_document_id",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  // Apply filters
  if (filters.document_type) {
    query = query.eq("document_type", filters.document_type);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.payment_method) {
    query = query.eq("payment_method", filters.payment_method);
  }
  if (filters.cash_register_id) {
    query = query.eq("cash_register_id", filters.cash_register_id);
  }

  // Date range (Peru TZ = UTC-5)
  if (filters.date_from) {
    query = query.gte("created_at", `${filters.date_from}T05:00:00Z`);
  }
  if (filters.date_to) {
    const nextDay = new Date(`${filters.date_to}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    query = query.lt("created_at", `${nextDayStr}T05:00:00Z`);
  }

  // Search by customer name or document number
  if (filters.search) {
    const s = filters.search.trim();
    query = query.or(
      `customer_name.ilike.%${s}%,customer_document_number.ilike.%${s}%`
    );
  }

  const { data: invoices, error, count } = await query;
  if (error) throw new Error(error.message);
  if (!invoices || invoices.length === 0) return { data: [], total: 0 };

  // Batch-fetch series codes
  const seriesIds = [
    ...new Set(invoices.map((inv) => inv.series_id).filter(Boolean)),
  ];
  let seriesMap: Record<string, string> = {};
  if (seriesIds.length > 0) {
    const { data: series } = await supabase
      .from("invoice_series")
      .select("id, series_code")
      .in("id", seriesIds);
    if (series) {
      seriesMap = Object.fromEntries(
        series.map((s) => [s.id, s.series_code])
      );
    }
  }

  // Batch-fetch cash register names + branch_id
  const cashRegisterIds = [
    ...new Set(invoices.map((inv) => inv.cash_register_id).filter(Boolean)),
  ] as string[];
  let registerMap: Record<
    string,
    { name: string; branch_id: string | null }
  > = {};
  if (cashRegisterIds.length > 0) {
    const { data: registers } = await supabase
      .from("cash_registers")
      .select("id, name, branch_id")
      .in("id", cashRegisterIds);
    if (registers) {
      registerMap = Object.fromEntries(
        registers.map((r) => [r.id, { name: r.name, branch_id: r.branch_id }])
      );
    }
  }

  // Batch-fetch branch names
  const branchIds = [
    ...new Set(
      Object.values(registerMap)
        .map((r) => r.branch_id)
        .filter(Boolean)
    ),
  ] as string[];
  let branchMap: Record<string, string> = {};
  if (branchIds.length > 0) {
    const { data: branches } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);
    if (branches) {
      branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
    }
  }

  // Batch-fetch reference invoice data for NC/ND (comprobante origen)
  const refInvoiceIds = [
    ...new Set(invoices.map((inv) => inv.reference_invoice_id).filter(Boolean)),
  ] as string[];
  let refMap: Record<string, { series_code: string; correlative: number }> = {};
  if (refInvoiceIds.length > 0) {
    const { data: refInvoices } = await supabase
      .from("invoices")
      .select("id, series_id, correlative_number")
      .in("id", refInvoiceIds);
    if (refInvoices) {
      for (const ref of refInvoices) {
        refMap[ref.id] = {
          series_code: ref.series_id ? seriesMap[ref.series_id] ?? "" : "",
          correlative: ref.correlative_number,
        };
      }
    }
  }

  const data: InvoiceListItem[] = invoices.map((inv) => {
    const reg = inv.cash_register_id
      ? registerMap[inv.cash_register_id]
      : null;
    const ref = inv.reference_invoice_id ? refMap[inv.reference_invoice_id] : null;
    return {
      id: inv.id,
      document_type: inv.document_type,
      correlative_number: inv.correlative_number,
      series_code: inv.series_id ? seriesMap[inv.series_id] ?? "" : "",
      issue_date: inv.issue_date,
      customer_name: inv.customer_name,
      customer_document_type: inv.customer_document_type,
      customer_document_number: inv.customer_document_number,
      total: inv.total,
      status: inv.status,
      payment_method: inv.payment_method,
      cash_register_name: reg?.name ?? null,
      branch_name: reg?.branch_id ? branchMap[reg.branch_id] ?? null : null,
      created_at: inv.created_at,
      reference_series_code: ref?.series_code ?? null,
      reference_correlative: ref?.correlative ?? null,
      sunat_response_code: inv.sunat_response_code,
      sunat_response_desc: inv.sunat_response_desc,
      sunat_document_id: inv.sunat_document_id,
    };
  });

  return { data, total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Invoice Detail
// ---------------------------------------------------------------------------
export async function getInvoiceDetail(
  invoiceId: string
): Promise<InvoiceDetail | null> {
  const { supabase, tenantId } = await getTenantId();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !invoice) return null;

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order");

  // Fetch series code
  let seriesCode = "";
  if (invoice.series_id) {
    const { data: series } = await supabase
      .from("invoice_series")
      .select("series_code")
      .eq("id", invoice.series_id)
      .single();
    seriesCode = series?.series_code ?? "";
  }

  // Fetch cash register name + branch
  let cashRegisterName: string | null = null;
  let branchName: string | null = null;
  if (invoice.cash_register_id) {
    const { data: register } = await supabase
      .from("cash_registers")
      .select("name, branch_id")
      .eq("id", invoice.cash_register_id)
      .single();
    if (register) {
      cashRegisterName = register.name;
      if (register.branch_id) {
        const { data: branch } = await supabase
          .from("branches")
          .select("name")
          .eq("id", register.branch_id)
          .single();
        branchName = branch?.name ?? null;
      }
    }
  }

  // Fetch cashier name
  let cashierName: string | null = null;
  if (invoice.cashier_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", invoice.cashier_id)
      .single();
    cashierName = profile?.full_name ?? null;
  }

  return {
    ...invoice,
    series_code: seriesCode,
    cash_register_name: cashRegisterName,
    branch_name: branchName,
    cashier_name: cashierName,
    items: items || [],
  };
}

// ---------------------------------------------------------------------------
// Invoice PDF data (detalle + datos del emisor desde fact_config)
// ---------------------------------------------------------------------------
export async function getInvoicePdfData(
  invoiceId: string
): Promise<InvoicePdfPayload | null> {
  const { supabase, tenantId } = await requirePermission(
    "ventas.comprobantes",
    "view"
  );

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .single();
  if (error || !invoice) return null;

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("sort_order");

  let seriesCode = "";
  if (invoice.series_id) {
    const { data: series } = await supabase
      .from("invoice_series")
      .select("series_code")
      .eq("id", invoice.series_id)
      .single();
    seriesCode = series?.series_code ?? "";
  }

  let cashRegisterName: string | null = null;
  let branchName: string | null = null;
  if (invoice.cash_register_id) {
    const { data: register } = await supabase
      .from("cash_registers")
      .select("name, branch_id")
      .eq("id", invoice.cash_register_id)
      .single();
    if (register) {
      cashRegisterName = register.name;
      if (register.branch_id) {
        const { data: branch } = await supabase
          .from("branches")
          .select("name")
          .eq("id", register.branch_id)
          .single();
        branchName = branch?.name ?? null;
      }
    }
  }

  let cashierName: string | null = null;
  if (invoice.cashier_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", invoice.cashier_id)
      .single();
    cashierName = profile?.full_name ?? null;
  }

  const { data: factConfig } = await supabase
    .from("fact_config")
    .select("ruc, razon_social, direccion_fiscal, logo_url")
    .eq("tenant_id", tenantId)
    .single();

  const emisor = {
    ruc: factConfig?.ruc ?? "",
    razonSocial: factConfig?.razon_social ?? "",
    direccion: factConfig?.direccion_fiscal ?? "",
    logoUrl: factConfig?.logo_url ?? null,
  };

  return {
    invoice: {
      ...invoice,
      series_code: seriesCode,
      cash_register_name: cashRegisterName,
      branch_name: branchName,
      cashier_name: cashierName,
      items: items || [],
    },
    emisor,
  };
}

// ---------------------------------------------------------------------------
// Customer KPIs
// ---------------------------------------------------------------------------
export async function getCustomerKPIs(): Promise<CustomerKPIs> {
  const { supabase, tenantId } = await getTenantId();

  const { data: customers } = await supabase
    .from("customers")
    .select("document_type")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  let total = 0;
  let ruc = 0;
  let dni = 0;
  let otros = 0;

  (customers || []).forEach((c) => {
    total += 1;
    switch (c.document_type) {
      case "ruc":
        ruc += 1;
        break;
      case "dni":
        dni += 1;
        break;
      default:
        otros += 1;
        break;
    }
  });

  return { total, ruc, dni, otros };
}

// ---------------------------------------------------------------------------
// Customers (paginated)
// ---------------------------------------------------------------------------
export async function getCustomers(
  filters: CustomerFilters
): Promise<{ data: CustomerListItem[]; total: number }> {
  const { supabase, tenantId } = await getTenantId();

  const page = filters.page ?? 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("customers")
    .select(
      "id, document_type, document_number, legal_name, trade_name, address, email, phone, created_at",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.document_type) {
    query = query.eq("document_type", filters.document_type);
  }

  if (filters.search) {
    const s = filters.search.trim();
    query = query.or(
      `legal_name.ilike.%${s}%,document_number.ilike.%${s}%`
    );
  }

  const { data: customers, error, count } = await query;
  if (error) throw new Error(error.message);
  if (!customers || customers.length === 0) return { data: [], total: 0 };

  const data: CustomerListItem[] = customers.map((c) => ({
    id: c.id,
    document_type: c.document_type,
    document_number: c.document_number,
    legal_name: c.legal_name,
    trade_name: c.trade_name,
    address: c.address,
    email: c.email,
    phone: c.phone,
    created_at: c.created_at,
  }));

  return { data, total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Soft-delete customer
// ---------------------------------------------------------------------------
export async function deleteCustomer(id: string) {
  let supabase, tenantId, userId;
  try {
    ({ supabase, tenantId, userId } = await requirePermission(
      "ventas.clientes",
      "delete"
    ));
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("legal_name, document_number")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (!customer) {
    return { success: false as const, error: "Cliente no encontrado" };
  }

  const { error } = await supabase
    .from("customers")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) return { success: false as const, error: error.message };

  void notifyModuleAction({
    tenantId,
    actorId: userId,
    moduleCodes: ["ventas.clientes"],
    title: "Cliente eliminado",
    message: `Se eliminó el cliente "${customer.legal_name}" (${customer.document_number}).`,
    resourceType: "customer",
    resourceId: id,
    type: "info",
  }).catch((e) => console.error("[deleteCustomer] notify error:", e));

  revalidatePath("/ventas/clientes");
  return { success: true as const, message: "Cliente eliminado." };
}
