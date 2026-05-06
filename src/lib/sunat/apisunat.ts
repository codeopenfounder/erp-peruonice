/**
 * Shim legacy — la implementación se movió a providers/apisunat-adapter.ts.
 * Mantenemos las funciones exportadas para no romper imports antiguos.
 *
 * Para nuevo código, usar el factory:
 *   import { getSunatProvider } from "@/lib/sunat/factory";
 *   const provider = getSunatProvider(factConfig.provider);
 *   await provider.submit(config, invoiceId, invoice);
 */

import { ApiSunatAdapter } from "./providers/apisunat-adapter";
import type {
  FactConfig,
  StatusResult,
  SunatInvoiceInput,
  SunatProviderResponse,
  VoidResult,
} from "./types";

const adapter = new ApiSunatAdapter();

export type { FactConfig, SunatInvoiceInput, SunatProviderResponse, VoidResult, StatusResult };

// Aliases para retro-compatibilidad
export type InvoiceForSunat = SunatInvoiceInput;
export type SunatResponse = SunatProviderResponse;

export async function submitToSunat(
  config: FactConfig,
  invoiceId: string,
  invoice: SunatInvoiceInput,
): Promise<SunatProviderResponse> {
  return adapter.submit(config, invoiceId, invoice);
}

export async function voidDocument(
  config: FactConfig,
  documentType: string,
  seriesCode: string,
  correlativeNumber: number,
  reason: string,
): Promise<VoidResult> {
  return adapter.void(config, documentType, seriesCode, correlativeNumber, reason);
}

export async function checkStatus(
  config: FactConfig,
  documentType: string,
  seriesCode: string,
  correlativeNumber: number,
): Promise<StatusResult> {
  return adapter.status(config, documentType, seriesCode, correlativeNumber);
}

// Alias antiguo
export async function voidBill(
  config: FactConfig,
  _documentId: string,
  reason: string,
  documentType?: string,
  seriesCode?: string,
  correlativeNumber?: number,
): Promise<VoidResult> {
  if (!documentType || !seriesCode || correlativeNumber == null) {
    return {
      success: false,
      ticket: null,
      error: "Datos de documento incompletos para anulación",
    };
  }
  return voidDocument(config, documentType, seriesCode, correlativeNumber, reason);
}
