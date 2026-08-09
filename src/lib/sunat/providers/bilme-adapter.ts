/**
 * Adapter para Bilme (https://billmeperu.com)
 * Documentación: https://quinodevelop.gitbook.io/billme/
 *
 * Todo lo de este archivo está verificado contra la API real, no solo contra la
 * documentación: la doc no contiene ni un solo ejemplo de respuesta y varias de
 * sus tablas contradicen a sus propios ejemplos.
 *
 * Particularidades que condicionan el diseño:
 * - Header `token` plano (no Bearer).
 * - Un solo host: el ambiente (beta vs producción de SUNAT) lo determina el
 *   TOKEN, según se haya registrado la empresa como "Desarrollo" o "Producción".
 *   Por eso `is_production` aquí no elige URL; solo habilita ConsultarCdr.
 * - Devuelve XML y CDR en base64, nunca URLs ni PDF, y los purga a los 40-90
 *   días → se suben a Supabase Storage y se guarda una signed URL.
 * - No devuelve el hash: hay que extraerlo del XML firmado.
 * - No detecta duplicados: reenviar el mismo comprobante responde "aceptada"
 *   otra vez. La unicidad la garantiza el índice de `invoices`.
 */

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
  SunatSummaryRef,
  SunatSummaryType,
  TicketResult,
  VoidResult,
} from "../types";
import {
  DEFAULT_CODIGO_CLASIFICACION,
  mapCodigoAfectacionGratuita,
  mapCodigoAfectacionIgv,
  mapCodigoTipoPrecio,
  mapCodigoTributo,
  mapCodigoUnidad,
  tryMapCodigoTipoDocumento,
} from "./bilme-mappings";

/** Establecimiento anexo. "0000" = domicilio fiscal (default de Billme). */
const SUCURSAL_DEFAULT = "0000";
const REQUEST_TIMEOUT_MS = 30_000;

/** El objeto útil, que siempre viene anidado bajo `data`. */
interface BilmeData {
  description?: string;
  observations?: string[];
  faultCode?: string;
  faultDescription?: string;
  ticketNumber?: string | null;
  /** El comprobante UBL firmado, en base64. Viene incluso si SUNAT lo rechaza. */
  xmlDocument?: string;
  /** CDR de SUNAT (ZIP en base64). Vacío cuando hay rechazo. */
  cdrBase64?: string;
  xmlBase64?: string;
}

/** Resultado normalizado de una llamada, ya con las 3 formas de respuesta resueltas. */
interface BilmeCall {
  httpOk: boolean;
  data: BilmeData | null;
  /** Mensaje legible cuando el fallo no viene en forma de `faultCode`. */
  transportError: string | null;
}

export class BilmeAdapter implements SunatProvider {
  readonly name = "bilme";
  private readonly baseUrl = "https://www.api.billmeperu.com/api/v1";

  // -------------------------------------------------------------------------
  // Métodos públicos
  // -------------------------------------------------------------------------

  async submit(
    config: FactConfig,
    invoiceId: string,
    invoice: SunatInvoiceInput,
  ): Promise<SunatProviderResponse> {
    const endpoint = this.endpointForDocument(invoice.document_type);
    if (!endpoint) {
      return this.failure(
        `Tipo de documento no emitible en SUNAT: ${invoice.document_type}`,
      );
    }

    const documentId = `${invoice.series_code}-${padCorrelative(invoice.correlative_number)}`;

    try {
      const payload = this.buildPayload(config, invoice);
      const call = await this.post(endpoint, config.api_token, payload);

      // Éxito = HTTP ok + sobre presente + faultCode vacío. En rechazo llega
      // "soap-env:Client.2800"; en algunos errores llega "-". Nunca undefined,
      // salvo que la respuesta no sea el sobre de Billme.
      const accepted =
        call.httpOk && !!call.data && !call.data.faultCode;

      if (!call.data) {
        return this.failure(call.transportError ?? "Respuesta vacía de Bilme");
      }

      const { fecha } = formatEmissionDate(invoice.created_at);
      const emittedAt = new Date(fecha);

      let xmlUrl: string | null = null;
      let cdrUrl: string | null = null;
      let hashCode: string | null = null;

      if (accepted) {
        hashCode = extractDigestValue(call.data.xmlDocument);
        try {
          xmlUrl = await this.uploadIfPresent(
            call.data.xmlDocument,
            config.tenant_id,
            invoiceId,
            "xml",
            emittedAt,
          );
          cdrUrl = await this.uploadIfPresent(
            call.data.cdrBase64,
            config.tenant_id,
            invoiceId,
            "cdr",
            emittedAt,
          );
        } catch (err) {
          // Bilme aceptó pero Storage falló: no se invalida una emisión buena
          // por no haber podido archivar el XML. status() puede recuperarlo.
          console.error("[BilmeAdapter] Falló la subida a Storage", err);
        }
      }

      return {
        success: accepted,
        documentId,
        status: accepted ? "ACEPTADO" : "RECHAZADO",
        sunatResponseCode: accepted
          ? null
          : normalizeFaultCode(call.data.faultCode) ?? "ERROR",
        sunatResponseDesc: accepted
          ? call.data.description ?? null
          : this.describeFailure(call),
        hashCode,
        xmlUrl,
        cdrUrl,
        ticket: call.data.ticketNumber || null,
      };
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : "Error de conexión con Bilme",
      );
    }
  }

  /**
   * Anulación por Resumen de Bajas (RA). Billme no tiene endpoint de anulación:
   * se envía un resumen y devuelve un TICKET que hay que consultar aparte con
   * ConsultarEstadoTicket. La respuesta inmediata sólo dice que SUNAT recibió el
   * resumen, no que lo haya aceptado.
   *
   * El correlativo del resumen lo numera el emisor, no Billme. Antes iba fijo a
   * "1", así que la segunda baja del mismo día reutilizaba el identificador
   * `RA-AAAAMMDD-1` del primer resumen. Ahora lo aporta quien llama, resuelto con
   * `fn_next_summary_correlative()`; el adapter sigue sin tocar la base.
   *
   * Nota de alcance: el botón "Anular" del POS sigue deshabilitado a propósito —
   * se anula emitiendo una NC motivo 01, que es válido, síncrono y no depende de
   * consultar un ticket. Este camino existe para la anulación desde el ERP.
   */
  async void(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
    reason: string,
    summary?: SunatSummaryRef,
  ): Promise<VoidResult> {
    const codigo = tryMapCodigoTipoDocumento(documentType);
    if (!codigo) {
      return { success: false, ticket: null, error: `Tipo de documento no anulable: ${documentType}` };
    }

    // Una boleta NO se da de baja por RA: el RA (VoidedDocuments) cubre facturas
    // y las notas vinculadas a factura. La baja de una boleta va dentro de un
    // Resumen Diario con el ítem en estado 3, que es otro documento y otro
    // flujo. Mandarla por RA produce un rechazo de SUNAT, así que se corta aquí
    // con un mensaje que dice qué hacer en su lugar.
    if (codigo === "03") {
      return {
        success: false,
        ticket: null,
        error:
          "Una boleta no se anula por Resumen de Bajas. Emita una nota de crédito con motivo 01 (anulación de la operación).",
      };
    }

    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const ref: SunatSummaryRef = summary ?? { correlative: 1, referenceDate: hoy };

    try {
      const call = await this.post("/Emission/EnviarResumen", config.api_token, {
        tipoComprobante: "RA",
        // Billme llama "serie" al AAAAMMDD del identificador del resumen.
        serie: ref.referenceDate.replace(/-/g, ""),
        correlativo: String(ref.correlative),
        fechaReferencia: ref.referenceDate,
        fechaEnvio: hoy,
        emisor: {
          codigoTipoDocumento: "6",
          numDocumento: config.ruc,
          razonSocial: config.razon_social,
        },
        documentos: [
          {
            codigoTipoDocumento: codigo,
            serieComprobante: seriesCode,
            correlativo: String(correlativeNumber),
          },
        ],
        comentario: reason || "Anulación de la operación",
      });

      const ok = call.httpOk && !!call.data && !call.data.faultCode;
      return {
        success: ok,
        ticket: call.data?.ticketNumber || null,
        error: ok ? null : this.describeFailure(call),
        summary: ref,
      };
    } catch (error) {
      return {
        success: false,
        ticket: null,
        error: error instanceof Error ? error.message : "Error de conexión con Bilme",
        summary: ref,
      };
    }
  }

  /**
   * Consulta del CDR. Verificado contra la API: solo funciona para empresas de
   * PRODUCCIÓN y solo para facturas, notas de crédito y notas de débito. Con un
   * token de desarrollo responde 401, y para boletas no está disponible.
   */
  async status(
    config: FactConfig,
    documentType: string,
    seriesCode: string,
    correlativeNumber: number,
  ): Promise<StatusResult> {
    const codigo = tryMapCodigoTipoDocumento(documentType);
    if (!codigo) {
      return this.statusFailure(`Tipo de documento no consultable: ${documentType}`);
    }
    if (codigo === "03") {
      return this.statusFailure(
        "Bilme no permite consultar el CDR de boletas. Solo facturas y notas.",
      );
    }
    if (!config.is_production) {
      return this.statusFailure(
        "La consulta de CDR solo está disponible con un token de empresa de producción.",
      );
    }

    try {
      const call = await this.post("/Emission/ConsultarCdr", config.api_token, {
        numDocEmisor: config.ruc,
        tipoComprobante: codigo,
        serie: seriesCode,
        correlativo: String(correlativeNumber),
      });

      const ok = call.httpOk && !!call.data && !call.data.faultCode;
      if (!ok) return this.statusFailure(this.describeFailure(call));

      const data = call.data!;
      let xmlUrl: string | null = null;
      let cdrUrl: string | null = null;
      try {
        const path = `${config.tenant_id}/_status_recovered/${seriesCode}-${padCorrelative(correlativeNumber)}`;
        if (data.cdrBase64) {
          cdrUrl = await uploadAndSign(
            Buffer.from(data.cdrBase64, "base64"),
            `${path}.cdr.zip`,
            "application/zip",
          );
        }
        if (data.xmlDocument) {
          xmlUrl = await uploadAndSign(
            Buffer.from(data.xmlDocument, "base64"),
            `${path}.xml`,
            "application/xml",
          );
        }
      } catch (err) {
        console.error("[BilmeAdapter.status] Falló la subida a Storage", err);
      }

      return {
        success: true,
        hash: extractDigestValue(data.xmlDocument),
        xmlUrl,
        cdrUrl,
        message: data.description ?? null,
      };
    } catch (error) {
      return this.statusFailure(
        error instanceof Error ? error.message : "Error de conexión con Bilme",
      );
    }
  }

  /**
   * Consulta del ticket de un resumen (RC/RA) — el paso que faltaba para que una
   * anulación deje de estar sólo "recibida".
   *
   * Contrato verificado contra la documentación de Billme (2026-08-08):
   *
   *     POST /Emission/ConsultarEstadoTicket
   *     { numDocEmisor, numTicket, tipoComprobante: "RC"|"RA", serie, correlativo }
   *
   * `serie` es el **AAAAMMDD** del identificador del resumen y `correlativo` el N
   * dentro de esa fecha: exactamente las dos columnas que guarda
   * `sunat_summaries` (`reference_date` y `correlative`).
   *
   * ⚠️ Billme NO documenta la respuesta de este endpoint — su tabla de
   * `respuesta-de-consultas` mete `cdrBase64`, `xmlBase64` y `ticketNumber` en una
   * sola tabla sin decir qué endpoint devuelve cuál. Por eso el mapeo de abajo se
   * apoya únicamente en lo que el sobre garantiza y NO desempaqueta el ZIP del
   * CDR para leer el `ResponseCode`: hacerlo exigiría un descompresor y, sobre
   * todo, fiarse de una forma de respuesta no documentada. La referencia de SUNAT
   * es que `getStatus` responde 0 = procesado (el contenido trae el CDR),
   * 98 = en proceso, 99 = procesado con errores.
   *
   * Traducción, en orden de precedencia:
   *   1. `faultCode` no vacío        → rejected  (passthrough del fault de SUNAT)
   *   2. descripción "en proceso"/98 → pending   (heurística, ver abajo)
   *   3. `cdrBase64` presente        → accepted  (SUNAT resolvió y entregó CDR)
   *   4. nada de lo anterior         → pending   (todavía no hay veredicto)
   *
   * La heurística de (2) va ANTES de (3) a propósito: si algún día Billme
   * devolviera el CDR del envío junto con un "en proceso", tratarlo como aceptado
   * marcaría como anulado un comprobante que SUNAT aún no ha dado de baja. Ante la
   * duda, `pending` sólo cuesta otra consulta en 2 minutos; `accepted` de más es
   * un comprobante mal declarado.
   */
  async checkTicket(
    config: FactConfig,
    summaryType: SunatSummaryType,
    summary: SunatSummaryRef,
    ticket: string,
  ): Promise<TicketResult> {
    try {
      const call = await this.post(
        "/Emission/ConsultarEstadoTicket",
        config.api_token,
        {
          numDocEmisor: config.ruc,
          numTicket: ticket,
          tipoComprobante: summaryType,
          // Billme llama "serie" al AAAAMMDD del identificador del resumen, igual
          // que en EnviarResumen.
          serie: summary.referenceDate.replace(/-/g, ""),
          correlativo: String(summary.correlative),
        },
      );

      if (!call.data) {
        // Sin sobre no hay veredicto: puede ser el proxy, el token o un ticket
        // que Billme todavía no reconoce. Nunca se concluye nada de esto.
        return {
          status: "pending",
          responseCode: null,
          responseDesc: call.transportError ?? "Bilme no devolvió datos del ticket",
          xmlUrl: null,
          cdrUrl: null,
        };
      }

      const data = call.data;

      if (data.faultCode) {
        return {
          status: "rejected",
          responseCode: normalizeFaultCode(data.faultCode) ?? "ERROR",
          responseDesc: this.describeFailure(call),
          xmlUrl: null,
          cdrUrl: null,
        };
      }

      const desc = data.description ?? null;
      if (isTicketInProgress(desc)) {
        return {
          status: "pending",
          responseCode: "98",
          responseDesc: desc,
          xmlUrl: null,
          cdrUrl: null,
        };
      }

      if (!data.cdrBase64) {
        return {
          status: "pending",
          responseCode: null,
          responseDesc: desc,
          xmlUrl: null,
          cdrUrl: null,
        };
      }

      // Aceptado: se archiva el CDR (y el XML si viene) porque Billme los purga a
      // los 40-90 días y son la única prueba legal de la baja.
      let xmlUrl: string | null = null;
      let cdrUrl: string | null = null;
      try {
        const path = `${config.tenant_id}/_summaries/${summaryType}-${summary.referenceDate.replace(/-/g, "")}-${summary.correlative}`;
        cdrUrl = await uploadAndSign(
          Buffer.from(data.cdrBase64, "base64"),
          `${path}.cdr.zip`,
          "application/zip",
        );
        const xmlBase64 = data.xmlDocument || data.xmlBase64;
        if (xmlBase64) {
          xmlUrl = await uploadAndSign(
            Buffer.from(xmlBase64, "base64"),
            `${path}.xml`,
            "application/xml",
          );
        }
      } catch (err) {
        // Igual que en submit(): un fallo de Storage no invalida un veredicto
        // bueno de SUNAT.
        console.error("[BilmeAdapter.checkTicket] Falló la subida a Storage", err);
      }

      return {
        status: "accepted",
        responseCode: "0",
        responseDesc: desc,
        xmlUrl,
        cdrUrl,
      };
    } catch (error) {
      // Timeout o red: `pending`, no `rejected`. Un fallo de transporte no dice
      // nada sobre lo que SUNAT decidió.
      return {
        status: "pending",
        responseCode: null,
        responseDesc:
          error instanceof Error ? error.message : "Error de conexión con Bilme",
        xmlUrl: null,
        cdrUrl: null,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Transporte
  // -------------------------------------------------------------------------

  /**
   * Normaliza las tres formas de respuesta que devuelve la API:
   *   1. Sobre de Billme:  { statusCode, message, data: {...} | null }
   *   2. ProblemDetails de ASP.NET (validación de modelo):
   *      { title, status, errors: { "Emisor.Ubigeo": ["..."] } }  — sin `data`
   *   3. Cuerpo no-JSON (proxy caído, HTML de error)
   */
  private async post(
    endpoint: string,
    token: string,
    body: unknown,
  ): Promise<BilmeCall> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    let text: string;
    try {
      res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      text = await res.text();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          `Bilme no respondió en ${REQUEST_TIMEOUT_MS / 1000}s (${endpoint})`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        httpOk: false,
        data: null,
        transportError: `Bilme devolvió una respuesta no válida (HTTP ${res.status}): ${text.slice(0, 200)}`,
      };
    }

    const body_ = json as {
      message?: string;
      data?: BilmeData | null;
      title?: string;
      errors?: Record<string, string[]>;
    };

    // Forma 2: errores de validación del modelo.
    if (body_.errors && typeof body_.errors === "object") {
      const detail = Object.entries(body_.errors)
        .map(([field, msgs]) => `${field}: ${(msgs ?? []).join(", ")}`)
        .join(" | ");
      return {
        httpOk: false,
        data: null,
        transportError: detail || body_.title || `HTTP ${res.status}`,
      };
    }

    // Forma 1. `data` puede ser null en 401/404 (permiso o token inválido).
    return {
      httpOk: res.ok,
      data: body_.data ?? null,
      transportError: body_.data ? null : body_.message || `HTTP ${res.status}`,
    };
  }

  private describeFailure(call: BilmeCall): string {
    const d = call.data;
    return (
      d?.faultDescription ||
      d?.description ||
      (d?.observations?.length ? d.observations.join("; ") : null) ||
      call.transportError ||
      "Bilme rechazó el comprobante sin indicar motivo"
    );
  }

  private failure(message: string): SunatProviderResponse {
    return {
      success: false,
      documentId: null,
      status: "RECHAZADO",
      sunatResponseCode: "ERROR",
      sunatResponseDesc: message,
      hashCode: null,
      xmlUrl: null,
      cdrUrl: null,
    };
  }

  private statusFailure(message: string): StatusResult {
    return { success: false, hash: null, xmlUrl: null, cdrUrl: null, message };
  }

  private endpointForDocument(documentType: string): string | null {
    switch (documentType) {
      case "nota_credito":
        return "/Emission/EnviarNotaCredito";
      case "nota_debito":
        return "/Emission/EnviarNotaDebito";
      case "boleta":
      case "factura":
        return "/Emission/EnviarBoletaFactura";
      default:
        return null;
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
    const contentType = kind === "xml" ? "application/xml" : "application/zip";
    return uploadAndSign(Buffer.from(base64, "base64"), path, contentType);
  }

  // -------------------------------------------------------------------------
  // Construcción del payload
  // -------------------------------------------------------------------------

  private buildPayload(
    config: FactConfig,
    invoice: SunatInvoiceInput,
  ): Record<string, unknown> {
    if (invoice.document_type === "nota_credito") {
      return this.buildNotaPayload(config, invoice, "07");
    }
    if (invoice.document_type === "nota_debito") {
      return this.buildNotaPayload(config, invoice, "08");
    }
    return this.buildBoletaFacturaPayload(config, invoice);
  }

  /** Emisor completo, para boleta y factura. */
  private buildEmisor(config: FactConfig): Record<string, unknown> {
    return {
      codigoTipoDocumento: "6",
      numDocumento: config.ruc,
      razonSocial: config.razon_social,
      nombreComercial: config.razon_social,
      ubigeo: config.ubigeo || "",
      ciudad: config.departamento || "",
      provincia: config.provincia || "",
      distrito: config.distrito || "",
      direccion: config.direccion_fiscal || "",
      sucursal: SUCURSAL_DEFAULT,
    };
  }

  /** En notas de crédito y débito el emisor es reducido. */
  private buildEmisorNota(config: FactConfig): Record<string, unknown> {
    return {
      codigoTipoDocumento: "6",
      numDocumento: config.ruc,
      razonSocial: config.razon_social,
      sucursal: SUCURSAL_DEFAULT,
    };
  }

  private buildCliente(invoice: SunatInvoiceInput): Record<string, unknown> {
    return {
      ...this.buildClienteNota(invoice),
      ubigeo: "",
      ciudad: "",
      provincia: "",
      distrito: "",
      direccion: invoice.customer_address || "",
    };
  }

  /** En notas el cliente es reducido: solo identificación. */
  private buildClienteNota(invoice: SunatInvoiceInput): Record<string, unknown> {
    return {
      codigoTipoDocumento: mapCustomerDocType(invoice.customer_document_type),
      numDocumento: invoice.customer_document_number || "00000000",
      razonSocial: invoice.customer_name || "CLIENTE VARIOS",
    };
  }

  /**
   * Los importes de línea van sin IGV salvo `precioLista`. Comprobado contra el
   * XML que devuelve Billme:
   *   precioUnitario     -> cac:Price/cbc:PriceAmount                (sin IGV)
   *   precioLista        -> AlternativeConditionPrice/cbc:PriceAmount (con IGV)
   *   montoSinImpuesto   -> cbc:LineExtensionAmount                   (valor de venta)
   *   montoTotal         -> también cbc:LineExtensionAmount
   *
   * Los descuentos ya vienen aplicados dentro de `subtotal`/`total`, así que
   * `montoDescuento` va en 0: informarlo otra vez lo descontaría dos veces.
   */
  private buildProductos(
    items: SunatInvoiceItemInput[],
    emitFreeLines: boolean,
  ): unknown[] {
    return items
      .filter((item) => !isDroppedLine(item, emitFreeLines))
      .map((item, idx) => {
        const cantidad = item.quantity;
        const gratuita = isFreeLine(item) && emitFreeLines;

        if (gratuita) return this.buildProductoGratuito(item, idx);

        const valorUnitario = cantidad > 0 ? item.subtotal / cantidad : 0;
        const precioConIgv = cantidad > 0 ? item.total / cantidad : 0;
        const tributo = mapCodigoTributo(item.tax_type);
        const codigoAfectacionIgv = mapCodigoAfectacionIgv(item.tax_type);
        const igvMonto = round2(item.igv_amount || 0);
        const baseImponible = round2(item.subtotal);

        return {
          id: `p-${idx + 1}`,
          unidades: cantidad,
          codigoUnidad: mapCodigoUnidad(item.unit_of_measure),
          nombre: item.description,
          moneda: "PEN",
          precioUnitario: round6(valorUnitario),
          precioLista: round6(precioConIgv),
          montoSinImpuesto: baseImponible,
          montoImpuestos: igvMonto,
          montoTotal: baseImponible,
          montoIcbper: 0,
          factorIcbper: 0,
          montoDescuento: 0,
          codigoTipoPrecio: mapCodigoTipoPrecio(item.tax_type),
          codigoClasificacion: DEFAULT_CODIGO_CLASIFICACION,
          impuestos: [
            {
              monto: igvMonto,
              idCategoria: tributo.idCategoria,
              porcentaje: Number(item.igv_rate),
              codigoAfectacionIgv,
              codigoTributo: tributo.codigoTributo,
              nombreTributo: tributo.nombreTributo,
              codigoInterTributo: tributo.codigoInterTributo,
            },
          ],
        };
      });
  }

  /**
   * Línea de entrega gratuita: una cortesía o un adicional.
   *
   * Estructura que exige SUNAT y cómo la nombra Billme:
   *
   * | Concepto SUNAT | Campo Billme | Valor |
   * |---|---|---|
   * | `cac:Price/cbc:PriceAmount` | `precioUnitario` | **0** — no se cobró nada |
   * | `AlternativeConditionPrice` + `PriceTypeCode 02` | `precioLista` + `codigoTipoPrecio` | valor referencial unitario **con** IGV |
   * | `cbc:LineExtensionAmount` | `montoSinImpuesto` / `montoTotal` | valor referencial **sin** IGV × cantidad |
   * | `TaxTotal` tributo 9996 (GRA) | `impuestos[0]` | IGV calculado sobre esa base |
   * | Catálogo 07 de gratuidad | `codigoAfectacionIgv` | 15 / 21 / 37 según el bien |
   *
   * El valor referencial llega en `reference_value` y sale de
   * `lib/sunat/reference-values`: `supplies.cost_price` para un adicional,
   * `invoice_items.original_unit_price` para una cortesía. Se asume que INCLUYE
   * IGV, igual que cualquier precio del sistema (convención peruana: los precios
   * mostrados llevan el IGV dentro y el impuesto se extrae, nunca se añade).
   */
  private buildProductoGratuito(
    item: SunatInvoiceItemInput,
    idx: number,
  ): Record<string, unknown> {
    const cantidad = item.quantity;
    const referencialConIgv = item.reference_value ?? 0;
    const rate = Number(item.igv_rate) || 0;
    const referencialSinIgv = rate > 0 ? referencialConIgv / (1 + rate / 100) : referencialConIgv;
    const baseImponible = round2(referencialSinIgv * cantidad);
    const igvMonto = round2(baseImponible * (rate / 100));
    const tributo = mapCodigoTributo("gratuito");

    return {
      id: `p-${idx + 1}`,
      unidades: cantidad,
      codigoUnidad: mapCodigoUnidad(item.unit_of_measure),
      nombre: item.description,
      moneda: "PEN",
      // Lo efectivamente cobrado: nada.
      precioUnitario: 0,
      // El valor referencial va aquí, y `codigoTipoPrecio: "02"` es lo que le dice
      // a SUNAT que este importe NO es un precio sino una referencia.
      precioLista: round6(referencialConIgv),
      montoSinImpuesto: baseImponible,
      montoImpuestos: igvMonto,
      montoTotal: baseImponible,
      montoIcbper: 0,
      factorIcbper: 0,
      montoDescuento: 0,
      codigoTipoPrecio: "02",
      codigoClasificacion: DEFAULT_CODIGO_CLASIFICACION,
      impuestos: [
        {
          monto: igvMonto,
          idCategoria: tributo.idCategoria,
          porcentaje: rate,
          codigoAfectacionIgv: mapCodigoAfectacionGratuita(item.tax_type),
          codigoTributo: tributo.codigoTributo,
          nombreTributo: tributo.nombreTributo,
          codigoInterTributo: tributo.codigoInterTributo,
        },
      ],
    };
  }

  /** Boleta y factura: 9 campos. */
  private buildTotales(invoice: SunatInvoiceInput): Record<string, number> {
    const gravadas = round2(invoice.op_gravada || 0);
    const exoneradas = round2(invoice.op_exonerada || 0);
    const inafectas = round2(invoice.op_inafecta || 0);
    const total = round2(invoice.total);
    return {
      totalOpExoneradas: exoneradas,
      totalOpInafectas: inafectas,
      totalOpGravadas: gravadas,
      totalImpuestos: round2(invoice.igv_total || 0),
      totalSinImpuestos: round2(gravadas + exoneradas + inafectas),
      totalConImpuestos: total,
      totalPagar: total,
      totalDescuentoGlobal: 0,
      totalDescuentoProductos: 0,
    };
  }

  /** Notas: 5 campos, y termina en totalPagar (no lleva totalConImpuestos). */
  private buildTotalesNota(invoice: SunatInvoiceInput): Record<string, number> {
    return {
      totalOpExoneradas: round2(invoice.op_exonerada || 0),
      totalOpInafectas: round2(invoice.op_inafecta || 0),
      totalOpGravadas: round2(invoice.op_gravada || 0),
      totalImpuestos: round2(invoice.igv_total || 0),
      totalPagar: round2(invoice.total),
    };
  }

  private buildBoletaFacturaPayload(
    config: FactConfig,
    invoice: SunatInvoiceInput,
  ): Record<string, unknown> {
    const { date: emissionDate, fecha, hora } = formatEmissionDate(
      invoice.created_at,
    );
    const hasDetraction =
      !!invoice.has_detraction && invoice.document_type === "factura";

    const payload: Record<string, unknown> = {
      tipoOperacion: "010",
      codigoTipoOperacion: hasDetraction ? "1001" : "0101",
      serie: invoice.series_code,
      correlativo: String(invoice.correlative_number),
      fechaEmision: fecha,
      horaEmision: hora,
      fechaVencimiento:
        invoice.document_type === "factura"
          ? addDaysISO(emissionDate, 30)
          : fecha,
      codigoTipoDocumento: invoice.document_type === "factura" ? "01" : "03",
      moneda: "PEN",
      montoCredito: 0,
      formaPago: "Contado",
      igv: round2(invoice.igv_total || 0),
      icbper: 0,
      cuotas: [],
      emisor: this.buildEmisor(config),
      cliente: this.buildCliente(invoice),
      totales: this.buildTotales(invoice),
      productos: this.buildProductos(invoice.items, config.emit_free_lines === true),
    };

    if (hasDetraction) {
      payload.detraccion = {
        codigoMedioPago: invoice.detraction_payment_method || "001",
        cuentaBancaria: invoice.detraction_account || "",
        codigoBienServicio: invoice.detraction_code || "",
        porcentaje: invoice.detraction_percentage ?? 0,
        monto: round2(invoice.detraction_amount ?? 0),
      };
    }

    return payload;
  }

  /** Nota de crédito (07) y de débito (08) comparten estructura. */
  private buildNotaPayload(
    config: FactConfig,
    invoice: SunatInvoiceInput,
    tipoComprobante: "07" | "08",
  ): Record<string, unknown> {
    const { fecha, hora } = formatEmissionDate(invoice.created_at);
    const esCredito = tipoComprobante === "07";
    const codigoMotivo = invoice.reference_reason || (esCredito ? "01" : "02");
    const refDocType = invoice.reference_document_type || "boleta";

    return {
      tipoComprobante,
      moneda: "PEN",
      serie: invoice.series_code,
      correlativo: String(invoice.correlative_number),
      fechaEmision: fecha,
      horaEmision: hora,
      codigoMotivo,
      descripcionMotivo: esCredito
        ? getNCReason(codigoMotivo)
        : getNDReason(codigoMotivo),
      // Nombres verificados contra la API: con `serieRef`/`correlativoRef`
      // (lo que usaba este adapter) responde 400 "field is required".
      tipoComprobanteRef: tryMapCodigoTipoDocumento(refDocType) ?? "03",
      serieComprobanteRef: invoice.reference_series || "",
      correlativoComprobanteRef: String(invoice.reference_correlative ?? ""),
      igv: round2(invoice.igv_total || 0),
      icbper: 0,
      emisor: this.buildEmisorNota(config),
      cliente: this.buildClienteNota(invoice),
      totales: this.buildTotalesNota(invoice),
      productos: this.buildProductos(invoice.items, config.emit_free_lines === true),
    };
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const round2 = (n: number) => Number(n.toFixed(2));
const round6 = (n: number) => Number(n.toFixed(6));

/**
 * ¿Es una línea entregada sin contraprestación?
 *
 * Se reconoce por importe cero **y** valor referencial presente. El valor
 * referencial es lo que la distingue de una línea rota o de un ítem a 0 por error:
 * lo pone el servidor a partir de `supplies.cost_price` (adicional) o
 * `invoice_items.original_unit_price` (cortesía).
 */
export function isFreeLine(item: SunatInvoiceItemInput): boolean {
  return (
    item.total === 0 &&
    item.subtotal === 0 &&
    typeof item.reference_value === "number" &&
    item.reference_value > 0
  );
}

/**
 * ¿Se descarta la línea del payload?
 *
 * Con las líneas gratuitas apagadas, se descarta todo lo de importe cero — que es
 * el comportamiento histórico y la razón de que las cortesías no llegaran nunca a
 * SUNAT. Con ellas encendidas, sólo se descarta lo que está a cero **sin** valor
 * referencial, que no es declarable de ninguna forma.
 */
export function isDroppedLine(item: SunatInvoiceItemInput, emitFreeLines: boolean): boolean {
  if (item.total !== 0 || item.subtotal !== 0) return false;
  if (!emitFreeLines) return true;
  return !isFreeLine(item);
}

/**
 * Extrae el DigestValue del XML firmado. Es el hash que va en la representación
 * impresa y en el décimo campo del QR de SUNAT.
 *
 * El tag llega SIN prefijo de namespace, así que buscar `<ds:DigestValue>`
 * devuelve null siempre. Se acepta cualquier prefijo, o ninguno.
 */
export function extractDigestValue(xmlBase64: string | undefined): string | null {
  if (!xmlBase64) return null;
  try {
    const xml = Buffer.from(xmlBase64, "base64").toString("utf8");
    const match = xml.match(/<(?:\w+:)?DigestValue>([^<]*)<\/(?:\w+:)?DigestValue>/);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * `faultCode` llega como "soap-env:Client.2800". Nos quedamos con el código
 * SUNAT, que es lo que sirve para buscar el error en su catálogo.
 */
export function normalizeFaultCode(faultCode: string | undefined): string | null {
  if (!faultCode || faultCode === "-") return faultCode === "-" ? "ERROR" : null;
  const match = faultCode.match(/(\d{3,4})\s*$/);
  return match?.[1] ?? faultCode;
}

/**
 * ¿La respuesta del ticket dice "todavía estoy procesando"?
 *
 * SUNAT devuelve el código 98 ("El proceso aún no ha terminado") mientras valida
 * un resumen. Billme no documenta cómo lo expone, así que se reconoce por la
 * descripción además de por el código. Es una heurística deliberada y conservadora:
 * un falso positivo sólo provoca otra consulta dos minutos después, mientras que
 * dar por aceptada una baja que SUNAT aún no aceptó deja un comprobante mal
 * declarado. Cuando se confirme el formato real contra la API, esto se sustituye
 * por la comprobación exacta.
 */
export function isTicketInProgress(description: string | null | undefined): boolean {
  if (!description) return false;
  const d = description.toLowerCase();
  return (
    d.includes("en proceso") ||
    d.includes("aún no ha terminado") ||
    d.includes("aun no ha terminado") ||
    d.includes("procesando") ||
    IN_PROGRESS_CODE.test(d)
  );
}

/**
 * Un 98 con forma de CÓDIGO, no cualquier 98 dentro de un número.
 *
 * `\b98\b` parecía suficiente y no lo es: casa con `"monto 0.98"`, porque el punto
 * es un límite de palabra. Un resumen ACEPTADO cuya descripción llevara un importe
 * terminado en 98 se habría leído como "en proceso", se habría seguido consultando
 * hasta agotar `poll_attempts` y habría acabado marcado `failed` — dejando en
 * `pending_void` un comprobante que SUNAT sí dio de baja. Exactamente el error que
 * el orden de precedencia de `checkTicket` pretende evitar, cometido por el otro
 * lado.
 *
 * Se exige que el 98 no esté pegado a otro dígito ni a un separador decimal:
 * `"98"`, `"statusCode 98"` y `"código: 98"` casan; `"0.98"`, `"980"`, `"1980"` y
 * `"1,98"` no.
 */
const IN_PROGRESS_CODE = /(?:^|[^\d.,])98(?:$|[^\d.,])/;
