/**
 * Adapter para Bilme (https://billmeperu.com)
 * Documentación: https://quinodevelop.gitbook.io/billme/
 *
 * Diferencias clave vs apisunat.pe:
 * - Header `token` (no Bearer)
 * - Endpoints separados por tipo de comprobante
 * - Devuelve XML/CDR como base64 → se sube a Supabase Storage y se persiste signed URL
 * - Anulación SIEMPRE async vía EnviarResumen "RA" → ticket → polling con ConsultarEstadoTicket
 * - Requiere desglose línea por línea de impuestos con catálogos SUNAT
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  addDaysISO,
  formatEmissionDate,
  getNCReason,
  getNDReason,
  mapCustomerDocType,
  padCorrelative,
} from "../helpers";
import {
  buildSunatPath,
  uploadAndSign,
  type SunatDocumentKind,
} from "../storage";
import type {
  FactConfig,
  StatusResult,
  SunatInvoiceInput,
  SunatInvoiceItemInput,
  SunatProvider,
  SunatProviderResponse,
  VoidResult,
} from "../types";
import { SUNAT_STATUS_MAP } from "../types";
import {
  mapCodigoAfectacionIgv,
  mapCodigoTipoDocumento,
  mapCodigoTipoPrecio,
  mapCodigoTributo,
  mapCodigoUnidad,
} from "./bilme-mappings";

interface BilmeResponse {
  description?: string;
  observations?: string[];
  faultCode?: string;
  faultDescription?: string;
  ticketNumber?: string | null;
  xmlDocument?: string;
  xmlBase64?: string;
  cdrBase64?: string;
}

export class BilmeAdapter implements SunatProvider {
  readonly name = "bilme";
  private readonly baseUrl = "https://www.api.billmeperu.com/api/v1";

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  async submit(
    config: FactConfig,
    invoiceId: string,
    invoice: SunatInvoiceInput,
  ): Promise<SunatProviderResponse> {
    try {
      const endpoint = this.endpointForDocument(invoice.document_type);
      const payload = this.buildPayload(config, invoice);
      const json = await this.post<BilmeResponse>(
        endpoint,
        config.api_token,
        payload,
      );

      const isSuccess = !json.faultCode || json.faultCode === "";
      const { fecha } = formatEmissionDate(invoice.created_at);
      const emittedAt = new Date(fecha);

      let xmlUrl: string | null = null;
      let cdrUrl: string | null = null;

      if (isSuccess) {
        try {
          xmlUrl = await this.uploadIfPresent(
            json.xmlBase64 || json.xmlDocument,
            config.tenant_id,
            invoiceId,
            "xml",
            emittedAt,
          );
          cdrUrl = await this.uploadIfPresent(
            json.cdrBase64,
            config.tenant_id,
            invoiceId,
            "cdr",
            emittedAt,
          );
        } catch (err) {
          // Storage falló pero Bilme aceptó: no romper la emisión.
          // Persistimos accepted con xml_url=null; status() puede regenerar.
          console.error("[BilmeAdapter] Storage upload failed", err);
        }
      }

      const result: SunatProviderResponse = {
        success: isSuccess,
        documentId: `${invoice.series_code}-${padCorrelative(invoice.correlative_number)}`,
        status: isSuccess ? "ACEPTADO" : "RECHAZADO",
        sunatResponseCode: json.faultCode || null,
        sunatResponseDesc:
          json.description || json.faultDescription || (json.observations || []).join("; ") || null,
        hashCode: null,
        xmlUrl,
        cdrUrl,
        ticket: json.ticketNumber || null,
      };

      await this.persistToInvoice(invoiceId, result);
      return result;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Error de conexión Bilme";
      try {
        const errClient = createAdminClient();
        await errClient
          .from("invoices")
          .update({ sunat_response_desc: errorMsg })
          .eq("id", invoiceId);
      } catch {
        /* non-blocking */
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

  async void(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
    reason: string,
  ): Promise<VoidResult> {
    try {
      const payload = this.buildResumenAnulacionPayload(
        config,
        documentType,
        seriesCode,
        correlativeNumber,
        reason,
      );
      const json = await this.post<BilmeResponse>(
        "/Emission/EnviarResumen",
        config.api_token,
        payload,
      );
      const isSuccess = !json.faultCode || json.faultCode === "";
      return {
        success: isSuccess,
        ticket: json.ticketNumber || null,
        error: isSuccess
          ? null
          : json.faultDescription || json.description || null,
      };
    } catch (error) {
      return {
        success: false,
        ticket: null,
        error:
          error instanceof Error ? error.message : "Error de conexión Bilme",
      };
    }
  }

  async status(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
  ): Promise<StatusResult> {
    try {
      const json = await this.post<BilmeResponse>(
        "/Emission/ConsultarCdr",
        config.api_token,
        {
          numDocEmisor: config.ruc,
          tipoComprobante: mapCodigoTipoDocumento(documentType),
          serie: seriesCode,
          correlativo: String(correlativeNumber),
        },
      );

      const isSuccess = !json.faultCode || json.faultCode === "";
      let cdrUrl: string | null = null;
      let xmlUrl: string | null = null;

      if (isSuccess) {
        try {
          const path = `${config.tenant_id}/_status_recovered/${seriesCode}-${padCorrelative(correlativeNumber)}`;
          if (json.cdrBase64) {
            cdrUrl = await uploadAndSign(
              Buffer.from(json.cdrBase64, "base64"),
              `${path}.cdr.zip`,
              "application/zip",
            );
          }
          if (json.xmlBase64 || json.xmlDocument) {
            const xmlData = json.xmlBase64 || json.xmlDocument!;
            xmlUrl = await uploadAndSign(
              Buffer.from(xmlData, "base64"),
              `${path}.xml`,
              "application/xml",
            );
          }
        } catch (err) {
          console.error("[BilmeAdapter.status] Storage upload failed", err);
        }
      }

      return {
        success: isSuccess,
        hash: null,
        xmlUrl,
        cdrUrl,
        message: json.description || json.faultDescription || null,
      };
    } catch (error) {
      return {
        success: false,
        hash: null,
        xmlUrl: null,
        cdrUrl: null,
        message:
          error instanceof Error ? error.message : "Error de conexión Bilme",
      };
    }
  }

  /**
   * Hace polling de un ticket asíncrono de Bilme (anulaciones).
   * Para uso futuro por un job de reconciliación.
   */
  async pollTicket(
    config: FactConfig,
    ticketNumber: string,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
  ): Promise<VoidResult> {
    try {
      const json = await this.post<BilmeResponse>(
        "/Emission/ConsultarEstadoTicket",
        config.api_token,
        {
          numDocEmisor: config.ruc,
          numTicket: ticketNumber,
          tipoComprobante: "RA",
          serie: this.buildResumenSerie(),
          correlativo: "1",
        },
      );
      void documentType;
      void seriesCode;
      void correlativeNumber;
      const isSuccess = !json.faultCode || json.faultCode === "";
      return {
        success: isSuccess,
        ticket: ticketNumber,
        error: isSuccess
          ? null
          : json.faultDescription || json.description || null,
      };
    } catch (error) {
      return {
        success: false,
        ticket: ticketNumber,
        error:
          error instanceof Error ? error.message : "Error de conexión Bilme",
      };
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async post<T>(
    endpoint: string,
    token: string,
    body: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as T;
    return json;
  }

  private endpointForDocument(documentType: string): string {
    switch (documentType) {
      case "nota_credito":
        return "/Emission/EnviarNotaCredito";
      case "nota_debito":
        return "/Emission/EnviarNotaDebito";
      case "boleta":
      case "factura":
      default:
        return "/Emission/EnviarBoletaFactura";
    }
  }

  private async uploadIfPresent(
    base64: string | undefined,
    tenantId: string,
    invoiceId: string,
    kind: SunatDocumentKind,
    emittedAt: Date,
  ): Promise<string | null> {
    if (!base64) return null;
    const path = buildSunatPath(tenantId, invoiceId, kind, emittedAt);
    const buffer = Buffer.from(base64, "base64");
    const contentType =
      kind === "xml" ? "application/xml" : "application/zip";
    return uploadAndSign(buffer, path, contentType);
  }

  private async persistToInvoice(
    invoiceId: string,
    result: SunatProviderResponse,
  ): Promise<void> {
    const adminClient = createAdminClient();
    await adminClient
      .from("invoices")
      .update({
        status: SUNAT_STATUS_MAP[result.status] || "sent_to_sunat",
        sunat_document_id: result.documentId,
        sunat_response_code: result.sunatResponseCode,
        sunat_response_desc: result.sunatResponseDesc,
        hash_code: result.hashCode,
        xml_url: result.xmlUrl,
        cdr_url: result.cdrUrl,
        sunat_ticket: result.ticket || null,
      })
      .eq("id", invoiceId);
  }

  // -------------------------------------------------------------------------
  // Payload builders
  // -------------------------------------------------------------------------

  private buildPayload(
    config: FactConfig,
    invoice: SunatInvoiceInput,
  ): Record<string, unknown> {
    if (invoice.document_type === "nota_credito") {
      return this.buildNotaCreditoPayload(config, invoice);
    }
    if (invoice.document_type === "nota_debito") {
      return this.buildNotaDebitoPayload(config, invoice);
    }
    return this.buildBoletaFacturaPayload(config, invoice);
  }

  private buildEmisor(config: FactConfig): Record<string, unknown> {
    return {
      codigoTipoDocumento: "6",
      numDocumento: config.ruc,
      razonSocial: config.razon_social,
      ubigeo: config.ubigeo || undefined,
    };
  }

  private buildCliente(invoice: SunatInvoiceInput): Record<string, unknown> {
    return {
      codigoTipoDocumento: mapCustomerDocType(invoice.customer_document_type),
      numDocumento: invoice.customer_document_number || "00000000",
      razonSocial: invoice.customer_name || "CLIENTE VARIOS",
      direccion: invoice.customer_address || "-",
    };
  }

  private buildProductos(items: SunatInvoiceItemInput[]): unknown[] {
    return items
      .filter((item) => !(item.total === 0 && item.subtotal === 0))
      .map((item, idx) => {
        const cantidad = item.quantity;
        const valorUnitario = cantidad > 0 ? item.subtotal / cantidad : 0;
        const tributo = mapCodigoTributo(item.tax_type);
        const codigoAfectacion = mapCodigoAfectacionIgv(item.tax_type);
        const baseImponible = item.subtotal;
        const igvMonto = item.igv_amount || 0;

        return {
          id: String(idx + 1),
          unidades: cantidad,
          codigoUnidad: mapCodigoUnidad(item.unit_of_measure),
          nombre: item.description,
          precioUnitario: Number(valorUnitario.toFixed(6)),
          precioLista: Number(valorUnitario.toFixed(6)),
          montoSinImpuesto: Number(item.subtotal.toFixed(2)),
          montoTotal: Number(item.total.toFixed(2)),
          montoImpuestos: Number(igvMonto.toFixed(2)),
          codigoClasificacion: "01",
          codigoTipoPrecio: mapCodigoTipoPrecio(item.tax_type),
          codigoAfectacionIgv: codigoAfectacion,
          factorIcbper: 0,
          montoIcbper: 0,
          impuestos: [
            {
              id: "1",
              monto: Number(igvMonto.toFixed(2)),
              porcentaje: Number(item.igv_rate),
              baseImponible: Number(baseImponible.toFixed(2)),
              codigoTributo: tributo.codigoTributo,
              nombreTributo: tributo.nombreTributo,
              codigoInternacional: tributo.codigoInternacional,
              codigoAfectacionIgv: codigoAfectacion,
            },
          ],
        };
      });
  }

  private buildTotales(invoice: SunatInvoiceInput): Record<string, number> {
    return {
      totalOpExoneradas: Number((invoice.op_exonerada || 0).toFixed(2)),
      totalOpInafectas: Number((invoice.op_inafecta || 0).toFixed(2)),
      totalOpGravadas: Number((invoice.op_gravada || 0).toFixed(2)),
      totalImpuestos: Number((invoice.igv_total || 0).toFixed(2)),
      totalConImpuestos: Number(invoice.total.toFixed(2)),
    };
  }

  private buildBoletaFacturaPayload(
    config: FactConfig,
    invoice: SunatInvoiceInput,
  ): Record<string, unknown> {
    const { date: emissionDate, fecha, hora } = formatEmissionDate(
      invoice.created_at,
    );
    const codigoTipoDocumento = mapCodigoTipoDocumento(invoice.document_type);
    const fechaVencimiento =
      invoice.document_type === "factura"
        ? addDaysISO(emissionDate, 30)
        : fecha;

    const hasDetraction =
      !!invoice.has_detraction && invoice.document_type === "factura";

    const payload: Record<string, unknown> = {
      tipoOperacion: "010",
      codigoTipoOperacion: hasDetraction ? "1001" : "0101",
      serie: invoice.series_code,
      correlativo: String(invoice.correlative_number),
      fechaEmision: fecha,
      horaEmision: hora,
      fechaVencimiento,
      codigoTipoDocumento,
      moneda: "PEN",
      montoCredito: 0,
      formaPago: "Contado",
      igv: Number((invoice.igv_total || 0).toFixed(2)),
      icbper: 0,
      cuotas: [],
      emisor: this.buildEmisor(config),
      cliente: this.buildCliente(invoice),
      totales: this.buildTotales(invoice),
      productos: this.buildProductos(invoice.items),
    };

    if (hasDetraction) {
      payload.detraccion = {
        codigoMedioPago: invoice.detraction_payment_method || "001",
        cuentaBancaria: invoice.detraction_account || "",
        codigoBienServicio: invoice.detraction_code || "",
        porcentaje: invoice.detraction_percentage ?? 0,
        monto: Number((invoice.detraction_amount ?? 0).toFixed(2)),
      };
    }

    return payload;
  }

  private buildNotaCreditoPayload(
    config: FactConfig,
    invoice: SunatInvoiceInput,
  ): Record<string, unknown> {
    const { fecha, hora } = formatEmissionDate(invoice.created_at);
    const refDocType = invoice.reference_document_type || "boleta";
    const codigoMotivo = invoice.reference_reason || "01";

    return {
      tipoComprobante: "07",
      codigoMotivo,
      descripcionMotivo: getNCReason(codigoMotivo),
      tipoComprobanteRef: mapCodigoTipoDocumento(refDocType),
      serieRef: invoice.reference_series || "",
      correlativoRef: String(invoice.reference_correlative ?? ""),
      serie: invoice.series_code,
      correlativo: String(invoice.correlative_number),
      fechaEmision: fecha,
      horaEmision: hora,
      moneda: "PEN",
      igv: Number((invoice.igv_total || 0).toFixed(2)),
      icbper: 0,
      emisor: { ...this.buildEmisor(config), sucursal: "01" },
      cliente: this.buildCliente(invoice),
      totales: this.buildTotales(invoice),
      productos: this.buildProductos(invoice.items),
    };
  }

  private buildNotaDebitoPayload(
    config: FactConfig,
    invoice: SunatInvoiceInput,
  ): Record<string, unknown> {
    const { fecha, hora } = formatEmissionDate(invoice.created_at);
    const refDocType = invoice.reference_document_type || "boleta";
    const codigoMotivo = invoice.reference_reason || "02";

    return {
      tipoComprobante: "08",
      codigoMotivo,
      descripcionMotivo: getNDReason(codigoMotivo),
      tipoComprobanteRef: mapCodigoTipoDocumento(refDocType),
      serieRef: invoice.reference_series || "",
      correlativoRef: String(invoice.reference_correlative ?? ""),
      serie: invoice.series_code,
      correlativo: String(invoice.correlative_number),
      fechaEmision: fecha,
      horaEmision: hora,
      moneda: "PEN",
      igv: Number((invoice.igv_total || 0).toFixed(2)),
      icbper: 0,
      emisor: { ...this.buildEmisor(config), sucursal: "01" },
      cliente: this.buildCliente(invoice),
      totales: this.buildTotales(invoice),
      productos: this.buildProductos(invoice.items),
    };
  }

  private buildResumenSerie(date: Date = new Date()): string {
    const fecha = date.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    return fecha.replace(/-/g, "");
  }

  private buildResumenAnulacionPayload(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
    reason: string,
  ): Record<string, unknown> {
    const today = new Date();
    const fechaEnvio = today.toLocaleDateString("en-CA", {
      timeZone: "America/Lima",
    });
    return {
      tipoComprobante: "RA",
      serie: this.buildResumenSerie(today),
      correlativo: "1",
      fechaReferencia: fechaEnvio,
      fechaEnvio,
      emisor: this.buildEmisor(config),
      documentos: [
        {
          tipoComprobante: mapCodigoTipoDocumento(documentType),
          serieComprobante: seriesCode,
          correlativo: String(correlativeNumber),
          razonBaja: reason || "Anulación de la operación",
        },
      ],
    };
  }
}
