/**
 * Reconstrucción y reenvío de un comprobante a SUNAT, a partir de su id.
 *
 * Por qué existe
 * -------------
 * El bloque que arma el `SunatInvoiceInput` desde la base estaba escrito dos veces
 * —`autoRetrySunat` en `/api/fact/sync/pull` y `action: "retry"` en
 * `/api/fact/sunat`— y las dos copias ya habían divergido: la del pull no
 * seleccionaba `supply_id` (así que perdía el valor referencial de las líneas
 * gratuitas) y no filtraba la referencia por tipo de documento. Añadir el botón de
 * rescate del ERP habría creado una tercera.
 *
 * Aquí vive la versión canónica. `action: "retry"` del POS se conserva aparte
 * porque arrastra fallbacks que sólo aplican a comprobantes anteriores a la
 * denormalización del cliente (acepta los datos del cliente en el body y los
 * rellena en la fila); esa ruta se puede replegar sobre este módulo cuando esos
 * comprobantes dejen de existir.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getSunatProvider } from "./factory";
import { persistSunatError, persistSunatResult, registerSunatAttempt } from "./persist";
import { buildReferenceValueMap } from "./reference-values";
import { isEmisorRucValid } from "./ruc";
import type { FactConfig, SunatInvoiceInput } from "./types";

// Los `select` van en línea y no en constantes: postgrest-js infiere el tipo de la
// fila del literal de la cadena, y una constante concatenada le hace devolver
// `GenericStringError` para cada columna.

/**
 * Lee `fact_config` y valida el RUC del emisor antes de dejar emitir.
 *
 * La validación va aquí y no sólo en el formulario porque el RUC pudo guardarse
 * antes de que existiera el checksum: un RUC mal formado se acepta en desarrollo
 * de Billme —verificado: aceptó una boleta con un RUC ajeno— y sale rechazado en
 * producción con un correlativo ya consumido.
 */
export async function loadFactConfig(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<
  | { config: FactConfig & { detraction_account: string | null }; error: null }
  | { config: null; error: string }
> {
  const { data: raw } = await admin
    .from("fact_config")
    .select("ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, distrito, api_token, is_production, provider, detraction_account, emit_free_lines")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (!raw?.api_token) {
    return { config: null, error: "No hay configuración de facturación activa." };
  }

  if (!isEmisorRucValid(raw.ruc)) {
    return {
      config: null,
      error:
        `El RUC del emisor configurado (${raw.ruc}) no es válido: no pasa el dígito ` +
        `verificador de SUNAT. Corrígelo en Configuración › POI Fact antes de emitir.`,
    };
  }

  return {
    config: { ...raw, tenant_id: tenantId },
    error: null,
  };
}

/**
 * Reconstruye el `SunatInvoiceInput` de un comprobante ya persistido.
 *
 * Devuelve `null` cuando el comprobante no existe. Cualquier dato que falte se
 * resuelve con la misma cadena de fallbacks que la emisión original: la dirección
 * del cliente cae a la de la sede y luego a la fiscal.
 */
export async function buildInvoiceForSunat(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  invoiceId: string,
  config: FactConfig & { detraction_account: string | null },
): Promise<SunatInvoiceInput | null> {
  const { data: inv } = await admin
    .from("invoices")
    .select("id, series_id, correlative_number, document_type, customer_id, op_gravada, op_exonerada, op_inafecta, igv_total, total, reference_invoice_id, reference_reason, created_at, customer_document_type, customer_document_number, customer_name, customer_address, cash_register_id, has_detraction, detraction_code, detraction_percentage, detraction_amount, detraction_payment_method")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .single();

  if (!inv) return null;

  const { data: seriesData } = await admin
    .from("invoice_series")
    .select("series_code")
    .eq("id", inv.series_id)
    .single();

  // Cliente: primero lo denormalizado en la propia fila, luego la tabla.
  let customerDocType = inv.customer_document_type as string | null;
  let customerDocNumber = inv.customer_document_number as string | null;
  let customerName = inv.customer_name as string | null;
  let customerAddress = inv.customer_address as string | null;

  if (!customerDocType && inv.customer_id) {
    const { data: cust } = await admin
      .from("customers")
      .select("document_type, document_number, legal_name, address")
      .eq("id", inv.customer_id)
      .single();
    if (cust) {
      customerDocType = cust.document_type;
      customerDocNumber = cust.document_number;
      customerName = cust.legal_name;
      customerAddress = cust.address;
    }
  }

  // Dirección de la sede, para la cadena cliente → sede → fiscal.
  let branchAddress: string | null = null;
  if (inv.cash_register_id) {
    const { data: reg } = await admin
      .from("cash_registers")
      .select("branch_id")
      .eq("id", inv.cash_register_id)
      .single();
    if (reg?.branch_id) {
      const { data: branch } = await admin
        .from("branches")
        .select("address")
        .eq("id", reg.branch_id)
        .single();
      branchAddress = branch?.address || null;
    }
  }

  const { data: items } = await admin
    .from("invoice_items")
    .select("description, quantity, unit_price, unit_of_measure, igv_rate, igv_amount, subtotal, total, tax_type, supply_id, is_cortesia, original_unit_price")
    .eq("invoice_id", invoiceId)
    .order("sort_order");

  const referenceValueOf = await buildReferenceValueMap(admin, items || []);

  // Referencia SÓLO de notas. `reference_invoice_id` también lo usa una re-emisión
  // tras una NC motivo 02, y rellenar `tipoComprobanteRef` en una boleta normal la
  // convierte ante SUNAT en algo que no es.
  let refSeries: string | undefined;
  let refCorrelative: number | undefined;
  let refDocType: string | undefined;
  const isNote =
    inv.document_type === "nota_credito" || inv.document_type === "nota_debito";
  if (isNote && inv.reference_invoice_id) {
    const { data: refInv } = await admin
      .from("invoices")
      .select("series_id, correlative_number, document_type")
      .eq("id", inv.reference_invoice_id)
      .single();
    if (refInv) {
      const { data: refSeriesData } = await admin
        .from("invoice_series")
        .select("series_code")
        .eq("id", refInv.series_id)
        .single();
      refSeries = refSeriesData?.series_code;
      refCorrelative = refInv.correlative_number;
      refDocType = refInv.document_type;
    }
  }

  return {
    id: inv.id,
    document_type: inv.document_type,
    series_code: seriesData?.series_code || "B001",
    correlative_number: inv.correlative_number,
    customer_document_type: customerDocType || null,
    customer_document_number: customerDocNumber || null,
    customer_name: customerName || null,
    customer_address:
      customerAddress || branchAddress || config.direccion_fiscal || null,
    op_gravada: inv.op_gravada,
    op_exonerada: inv.op_exonerada,
    op_inafecta: inv.op_inafecta,
    igv_total: inv.igv_total,
    total: inv.total,
    items: (items || []).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      unit_of_measure: item.unit_of_measure,
      igv_rate: item.igv_rate,
      igv_amount: item.igv_amount,
      subtotal: item.subtotal,
      total: item.total,
      tax_type: item.tax_type,
      reference_value: referenceValueOf(item),
    })),
    reference_series: refSeries,
    reference_correlative: refCorrelative,
    reference_document_type: refDocType,
    reference_reason: inv.reference_reason || undefined,
    created_at: inv.created_at,
    // Sin esto, una factura con SPOT reenviada se emitía sin detracción, es decir:
    // un comprobante distinto del original.
    has_detraction: inv.has_detraction || false,
    detraction_code: inv.detraction_code || null,
    detraction_percentage: inv.detraction_percentage ?? null,
    detraction_amount: inv.detraction_amount ?? null,
    detraction_payment_method: inv.detraction_payment_method || null,
    detraction_account: config.detraction_account || null,
  };
}

export interface ResubmitResult {
  success: boolean;
  status?: string;
  responseCode?: string | null;
  responseDesc?: string | null;
  error?: string;
}

/** Reenvía un comprobante: cuenta el intento, emite y persiste el resultado. */
export async function resubmitInvoice(
  tenantId: string,
  invoiceId: string,
): Promise<ResubmitResult> {
  const admin = createAdminClient();

  const { config, error: configError } = await loadFactConfig(admin, tenantId);
  if (!config) return { success: false, error: configError };

  let provider;
  try {
    provider = getSunatProvider(config.provider);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Proveedor SUNAT no válido",
    };
  }

  const invoiceForSunat = await buildInvoiceForSunat(admin, tenantId, invoiceId, config);
  if (!invoiceForSunat) return { success: false, error: "Comprobante no encontrado" };

  try {
    await registerSunatAttempt(invoiceId);
    const result = await provider.submit(config, invoiceId, invoiceForSunat);
    await persistSunatResult(invoiceId, result);
    return {
      success: result.success,
      status: result.status,
      responseCode: result.sunatResponseCode,
      responseDesc: result.sunatResponseDesc,
      error: result.success ? undefined : result.sunatResponseDesc ?? "SUNAT rechazó el comprobante",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error enviando a SUNAT";
    await persistSunatError(invoiceId, message);
    return { success: false, error: message };
  }
}
