/**
 * SUNAT Electronic Invoicing via apisunat.pe
 *
 * Documented API: https://docs.apisunat.pe/
 * Endpoints:
 *   POST /api/v3/documents  — Emit factura, boleta, NC, ND
 *   POST /api/v3/voided     — Comunicación de baja (facturas)
 *   POST /api/v3/daily-summary — Resumen diario (boletas: emit/void)
 *   POST /api/v3/status     — Check document status at SUNAT
 */

import { createAdminClient } from "@/lib/supabase/admin";

// --- Types ---

export interface FactConfig {
  ruc: string;
  razon_social: string;
  direccion_fiscal: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  api_token: string;
  is_production: boolean;
}

export interface InvoiceForSunat {
  id: string;
  document_type: string;
  series_code: string;
  correlative_number: number;
  customer_document_type: string | null;
  customer_document_number: string | null;
  customer_name: string | null;
  customer_address: string | null;
  op_gravada: number;
  op_exonerada: number;
  op_inafecta: number;
  igv_total: number;
  total: number;
  items: InvoiceItemForSunat[];
  reference_series?: string;
  reference_correlative?: number;
  reference_document_type?: string;
  reference_reason?: string;
  created_at: string;
}

interface InvoiceItemForSunat {
  description: string;
  quantity: number;
  unit_price: number;
  unit_of_measure: string;
  igv_rate: number;
  igv_amount: number;
  subtotal: number;
  total: number;
  tax_type: string;
  reference_value?: number; // cost_price for gratuito items (SUNAT valor referencial)
}

export interface SunatResponse {
  success: boolean;
  documentId: string | null;
  status: string; // 'ACEPTADO' | 'RECHAZADO' | 'PENDIENTE'
  sunatResponseCode: string | null;
  sunatResponseDesc: string | null;
  hashCode: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
}

// --- Helpers ---

function getBaseUrl(isProduction: boolean): string {
  return isProduction
    ? "https://app.apisunat.pe"
    : "https://sandbox.apisunat.pe";
}

const SUNAT_CUSTOMER_DOC_TYPES: Record<string, string> = {
  ruc: "6",
  dni: "1",
  ce: "4",
  pasaporte: "7",
  sin_documento: "0",
};

const NC_REASONS: Record<string, string> = {
  "01": "Anulacion de la operacion",
  "02": "Anulacion por error en el RUC",
  "03": "Correccion por error en la descripcion",
  "04": "Descuento global",
  "05": "Descuento por item",
  "06": "Devolucion total",
  "07": "Devolucion por item",
  "08": "Bonificacion",
  "09": "Disminucion en el valor",
  "10": "Otros conceptos",
};

function buildDocumentPayload(
  invoice: InvoiceForSunat,
): Record<string, unknown> {
  const customerDocType =
    SUNAT_CUSTOMER_DOC_TYPES[invoice.customer_document_type || "sin_documento"] || "0";

  // SQLite stores UTC without indicator ("YYYY-MM-DD HH:MM:SS")
  // Supabase returns ISO with timezone ("YYYY-MM-DDTHH:MM:SS+00:00")
  // Normalize both to UTC before converting to Peru timezone
  const rawDate = invoice.created_at;
  const emissionDate = /[TZ+]/.test(rawDate)
    ? new Date(rawDate)
    : new Date(rawDate.replace(" ", "T") + "Z");
  const fechaEmision = emissionDate.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const horaEmision = emissionDate.toLocaleTimeString("en-GB", { timeZone: "America/Lima", hour12: false });

  const isNC = invoice.document_type === "nota_credito";
  const isND = invoice.document_type === "nota_debito";

  const payload: Record<string, unknown> = {
    documento: invoice.document_type,
    serie: invoice.series_code,
    numero: invoice.correlative_number,
    fecha_de_emision: fechaEmision,
    hora_de_emision: horaEmision,
    moneda: "PEN",
    tipo_operacion: "0101",
    cliente_tipo_de_documento: customerDocType,
    cliente_numero_de_documento: invoice.customer_document_number || "00000000",
    cliente_denominacion: invoice.customer_name || "CLIENTE VARIOS",
    items: invoice.items.map((item) => {
      const isGratuito = item.total === 0 && item.subtotal === 0;

      if (isGratuito) {
        // Transferencia gratuita (SUNAT: Gravado - Retiro por premio, código 11)
        const valorRef = item.reference_value || 0.01;
        return {
          unidad_de_medida: item.unit_of_measure,
          descripcion: item.description,
          cantidad: String(item.quantity),
          valor_unitario: valorRef.toFixed(6),
          porcentaje_igv: "18",
          codigo_tipo_afectacion_igv: "11",
          nombre_tributo: "GRA",
        };
      }

      const valorUnitario = item.subtotal / item.quantity;
      return {
        unidad_de_medida: item.unit_of_measure,
        descripcion: item.description,
        cantidad: String(item.quantity),
        valor_unitario: valorUnitario.toFixed(6),
        porcentaje_igv: String(item.igv_rate),
        codigo_tipo_afectacion_igv:
          item.tax_type === "gravado" ? "10" : item.tax_type === "exonerado" ? "20" : "30",
        nombre_tributo: item.tax_type === "gravado" ? "IGV"
          : item.tax_type === "exonerado" ? "EXO" : "INA",
      };
    }),
    total: invoice.total.toFixed(2),
  };

  // Customer address — always send (SUNAT requires it)
  payload.cliente_direccion = invoice.customer_address || "-";

  // Due date for facturas
  if (invoice.document_type === "factura") {
    // Default: 30 days from emission
    const dueDate = new Date(emissionDate);
    dueDate.setDate(dueDate.getDate() + 30);
    payload.fecha_de_vencimiento = dueDate.toISOString().split("T")[0];
  }

  // Credit note specific fields
  if (isNC && invoice.reference_series && invoice.reference_correlative) {
    const refDocType = invoice.reference_document_type || "boleta";
    payload.nota_credito_codigo_tipo = invoice.reference_reason || "01";
    payload.nota_credito_motivo =
      NC_REASONS[invoice.reference_reason || "01"] || "Anulacion de la operacion";
    payload.documento_afectado = {
      documento: refDocType,
      serie: invoice.reference_series,
      numero: invoice.reference_correlative,
    };
  }

  // Debit note specific fields
  if (isND && invoice.reference_series && invoice.reference_correlative) {
    const refDocType = invoice.reference_document_type || "boleta";
    const ndReasons: Record<string, string> = {
      "01": "Intereses por mora",
      "02": "Aumento en el valor",
      "03": "Penalidades / otros cargos",
    };
    payload.nota_debito_codigo_tipo = invoice.reference_reason || "02";
    payload.nota_debito_motivo =
      ndReasons[invoice.reference_reason || "02"] || "Aumento en el valor";
    payload.documento_afectado = {
      documento: refDocType,
      serie: invoice.reference_series,
      numero: invoice.reference_correlative,
    };
  }

  return payload;
}

// --- Main Functions ---

export async function submitToSunat(
  config: FactConfig,
  invoiceId: string,
  invoice: InvoiceForSunat,
): Promise<SunatResponse> {
  const baseUrl = getBaseUrl(config.is_production);
  const payload = buildDocumentPayload(invoice);

  try {
    const response = await fetch(`${baseUrl}/api/v3/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();

    // Map response to our SunatResponse interface
    const result: SunatResponse = {
      success: json.success ?? response.ok,
      documentId: null,
      status: response.ok && json.success !== false ? "ACEPTADO" : "RECHAZADO",
      sunatResponseCode: null,
      sunatResponseDesc: json.message || null,
      hashCode: json.payload?.hash || null,
      xmlUrl: json.payload?.xml || null,
      cdrUrl: json.payload?.cdr || null,
    };

    // Generate a document ID from serie-numero if not provided
    if (result.success) {
      result.documentId = `${invoice.series_code}-${String(invoice.correlative_number).padStart(8, "0")}`;
    }

    // Handle validation errors
    if (!response.ok && json.payload && typeof json.payload === "object") {
      const errors = Object.entries(json.payload)
        .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`)
        .join("; ");
      result.sunatResponseDesc = errors || json.message;
    }

    // Update invoice in Supabase with SUNAT response
    const adminClient = createAdminClient();
    const statusMap: Record<string, string> = {
      ACEPTADO: "accepted",
      RECHAZADO: "rejected",
      PENDIENTE: "sent_to_sunat",
    };

    await adminClient
      .from("invoices")
      .update({
        status: statusMap[result.status] || "sent_to_sunat",
        sunat_document_id: result.documentId,
        sunat_response_code: result.sunatResponseCode,
        sunat_response_desc: result.sunatResponseDesc,
        hash_code: result.hashCode,
        xml_url: result.xmlUrl,
        cdr_url: result.cdrUrl,
      })
      .eq("id", invoiceId);

    return result;
  } catch (error) {
    // Persist error to invoice for visibility in ERP comprobantes
    const errorMsg = error instanceof Error ? error.message : "Error de conexion";
    try {
      const errClient = createAdminClient();
      await errClient.from("invoices").update({
        sunat_response_desc: errorMsg,
      }).eq("id", invoiceId);
    } catch {
      // Non-blocking
    }

    return {
      success: false,
      documentId: null,
      status: "RECHAZADO",
      sunatResponseCode: "ERROR",
      sunatResponseDesc: errorMsg,
      hashCode: null,
      xmlUrl: null,
      cdrUrl: null,
    };
  }
}

export async function voidDocument(
  config: FactConfig,
  documentType: string,
  seriesCode: string,
  correlativeNumber: number,
  reason: string,
): Promise<{ success: boolean; ticket: string | null; error: string | null }> {
  const baseUrl = getBaseUrl(config.is_production);

  try {
    if (documentType === "boleta") {
      // Boleta: use resumen diario
      const response = await fetch(`${baseUrl}/api/v3/daily-summary`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documento: "resumen_diario",
          documentos_afectados: [
            {
              documento: "boleta",
              serie: seriesCode,
              numero: String(correlativeNumber),
              tipo_operacion: "anulacion",
            },
          ],
        }),
      });

      const json = await response.json();
      return {
        success: response.ok && json.success !== false,
        ticket: json.payload?.hash || null,
        error: json.message || null,
      };
    } else {
      // Factura/NC/ND: use comunicación de baja
      const response = await fetch(`${baseUrl}/api/v3/voided`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documento: "comunicacion_baja",
          motivo: reason || "ANULACIÓN DE OPERACIÓN",
          documento_afectado: {
            documento: documentType,
            serie: seriesCode,
            numero: String(correlativeNumber),
          },
        }),
      });

      const json = await response.json();
      return {
        success: response.ok && json.success !== false,
        ticket: json.payload?.hash || null,
        error: json.message || null,
      };
    }
  } catch (error) {
    return {
      success: false,
      ticket: null,
      error: error instanceof Error ? error.message : "Error de conexion",
    };
  }
}

export async function checkStatus(
  config: FactConfig,
  documentType: string,
  seriesCode: string,
  correlativeNumber: number,
): Promise<{ success: boolean; hash: string | null; xmlUrl: string | null; cdrUrl: string | null; message: string | null }> {
  const baseUrl = getBaseUrl(config.is_production);

  try {
    const response = await fetch(`${baseUrl}/api/v3/status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.api_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documento: documentType,
        serie: seriesCode,
        numero: correlativeNumber,
      }),
    });

    const json = await response.json();
    return {
      success: response.ok && json.success !== false,
      hash: json.payload?.hash || null,
      xmlUrl: json.payload?.xml || null,
      cdrUrl: json.payload?.cdr || null,
      message: json.message || null,
    };
  } catch (error) {
    return {
      success: false,
      hash: null,
      xmlUrl: null,
      cdrUrl: null,
      message: error instanceof Error ? error.message : "Error de conexion",
    };
  }
}

// Keep old function name as alias for backwards compatibility
export const voidBill = async (
  config: FactConfig,
  _documentId: string,
  reason: string,
  documentType?: string,
  seriesCode?: string,
  correlativeNumber?: number,
) => {
  if (!documentType || !seriesCode || correlativeNumber == null) {
    return { success: false, ticket: null, error: "Datos de documento incompletos para anulación" };
  }
  return voidDocument(config, documentType, seriesCode, correlativeNumber, reason);
};
