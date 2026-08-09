/**
 * Adapter para apisunat.pe
 * Refactor de la implementación original src/lib/sunat/apisunat.ts envuelta en clase.
 */

import {
  formatEmissionDate,
  getNCReason,
  getNDReason,
  mapCustomerDocType,
  padCorrelative,
} from "../helpers";
import type {
  FactConfig,
  StatusResult,
  SunatInvoiceInput,
  SunatProvider,
  SunatProviderResponse,
  VoidResult,
} from "../types";

export class ApiSunatAdapter implements SunatProvider {
  readonly name = "apisunat";

  private getBaseUrl(isProduction: boolean): string {
    return isProduction
      ? "https://app.apisunat.pe"
      : "https://sandbox.apisunat.pe";
  }

  private buildDocumentPayload(invoice: SunatInvoiceInput): Record<string, unknown> {
    const customerDocType = mapCustomerDocType(invoice.customer_document_type);
    const { date: emissionDate, fecha, hora } = formatEmissionDate(invoice.created_at);

    const isNC = invoice.document_type === "nota_credito";
    const isND = invoice.document_type === "nota_debito";

    const payload: Record<string, unknown> = {
      documento: invoice.document_type,
      serie: invoice.series_code,
      numero: invoice.correlative_number,
      fecha_de_emision: fecha,
      hora_de_emision: hora,
      moneda: "PEN",
      tipo_operacion: "0101",
      cliente_tipo_de_documento: customerDocType,
      cliente_numero_de_documento: invoice.customer_document_number || "00000000",
      cliente_denominacion: invoice.customer_name || "CLIENTE VARIOS",
      cliente_direccion: invoice.customer_address || "-",
      items: invoice.items
        .filter((item) => !(item.total === 0 && item.subtotal === 0))
        .map((item) => {
          const valorUnitario = item.subtotal / item.quantity;
          return {
            unidad_de_medida: item.unit_of_measure,
            descripcion: item.description,
            cantidad: String(item.quantity),
            valor_unitario: valorUnitario.toFixed(6),
            porcentaje_igv: String(item.igv_rate),
            codigo_tipo_afectacion_igv:
              item.tax_type === "gravado"
                ? "10"
                : item.tax_type === "exonerado"
                  ? "20"
                  : "30",
            nombre_tributo:
              item.tax_type === "gravado"
                ? "IGV"
                : item.tax_type === "exonerado"
                  ? "EXO"
                  : "INA",
          };
        }),
      total: invoice.total.toFixed(2),
    };

    if (invoice.document_type === "factura") {
      const dueDate = new Date(emissionDate);
      dueDate.setDate(dueDate.getDate() + 30);
      payload.fecha_de_vencimiento = dueDate.toISOString().split("T")[0];
    }

    // SPOT (detraccion): solo aplica a facturas
    if (invoice.has_detraction && invoice.document_type === "factura") {
      payload.tipo_operacion = "1001";
      payload.detraccion = {
        detraccion_tipo: invoice.detraction_code || "",
        detraccion_porcentaje: String(invoice.detraction_percentage ?? ""),
        detraccion_total: (invoice.detraction_amount ?? 0).toFixed(2),
        medio_de_pago: invoice.detraction_payment_method || "001",
        numero_cuenta_banco_nacion: invoice.detraction_account || "",
      };
      const importeNeto = (
        invoice.total - (invoice.detraction_amount ?? 0)
      ).toFixed(2);
      const dueDate = new Date(emissionDate);
      dueDate.setDate(dueDate.getDate() + 30);
      payload.cuotas = [
        {
          importe: importeNeto,
          fecha_de_pago: dueDate.toISOString().split("T")[0],
        },
      ];
      delete payload.fecha_de_vencimiento;
    }

    if (isNC && invoice.reference_series && invoice.reference_correlative) {
      const refDocType = invoice.reference_document_type || "boleta";
      payload.nota_credito_codigo_tipo = invoice.reference_reason || "01";
      payload.nota_credito_motivo = getNCReason(invoice.reference_reason);
      payload.documento_afectado = {
        documento: refDocType,
        serie: invoice.reference_series,
        numero: invoice.reference_correlative,
      };
    }

    if (isND && invoice.reference_series && invoice.reference_correlative) {
      const refDocType = invoice.reference_document_type || "boleta";
      payload.nota_debito_codigo_tipo = invoice.reference_reason || "02";
      payload.nota_debito_motivo = getNDReason(invoice.reference_reason);
      payload.documento_afectado = {
        documento: refDocType,
        serie: invoice.reference_series,
        numero: invoice.reference_correlative,
      };
    }

    return payload;
  }

  async submit(
    config: FactConfig,
    invoiceId: string,
    invoice: SunatInvoiceInput,
  ): Promise<SunatProviderResponse> {
    const baseUrl = this.getBaseUrl(config.is_production);
    const payload = this.buildDocumentPayload(invoice);

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

      const result: SunatProviderResponse = {
        success: json.success ?? response.ok,
        documentId: null,
        status:
          response.ok && json.success !== false ? "ACEPTADO" : "RECHAZADO",
        sunatResponseCode: null,
        sunatResponseDesc: json.message || null,
        hashCode: json.payload?.hash || null,
        xmlUrl: json.payload?.xml || null,
        cdrUrl: json.payload?.cdr || null,
      };

      if (result.success) {
        result.documentId = `${invoice.series_code}-${padCorrelative(invoice.correlative_number)}`;
      }

      if (!response.ok && json.payload && typeof json.payload === "object") {
        const errors = Object.entries(json.payload)
          .map(
            ([field, msgs]) =>
              `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`,
          )
          .join("; ");
        result.sunatResponseDesc = errors || json.message;
      }

      // La persistencia la hace quien llama, vía persistSunatResult().
      void invoiceId;
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Error de conexión";
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

  async void(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
    reason: string,
  ): Promise<VoidResult> {
    const baseUrl = this.getBaseUrl(config.is_production);

    try {
      if (documentType === "boleta") {
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
      }

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
    } catch (error) {
      return {
        success: false,
        ticket: null,
        error: error instanceof Error ? error.message : "Error de conexión",
      };
    }
  }

  async status(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
  ): Promise<StatusResult> {
    const baseUrl = this.getBaseUrl(config.is_production);
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
        message: error instanceof Error ? error.message : "Error de conexión",
      };
    }
  }
}
