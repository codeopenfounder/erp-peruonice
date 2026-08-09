/**
 * Persistencia del resultado de una emisión SUNAT.
 *
 * Vive fuera de los adaptadores a propósito. Antes cada adapter escribía él
 * mismo en `invoices`, y eso permitió que el adapter de Bilme intentara escribir
 * la columna `sunat_ticket` —eliminada en la migración 00015— sin que nadie
 * comprobara el `error`: PostgREST rechazaba el UPDATE entero y la emisión
 * quedaba sin estado, sin XML y sin CDR, en silencio. Con un solo punto de
 * escritura y el error comprobado, ese modo de fallo desaparece.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { SUNAT_STATUS_MAP, type SunatProviderResponse } from "./types";

/**
 * Re-export, no una segunda definición: el número vive en `policy.ts`, que no
 * tiene dependencias y por eso sí puede importarlo un componente cliente. Este
 * módulo arrastra el cliente admin de Supabase, y de ahí venía la copia literal
 * que había en `components/ventas/invoice-columns.tsx`.
 */
export { MAX_SUNAT_ATTEMPTS } from "./policy";

export async function persistSunatResult(
  invoiceId: string,
  result: SunatProviderResponse,
): Promise<void> {
  const admin = createAdminClient();

  const patch: Record<string, unknown> = {
    status: SUNAT_STATUS_MAP[result.status] ?? "sent_to_sunat",
    sunat_document_id: result.documentId,
    sunat_response_code: result.sunatResponseCode,
    sunat_response_desc: result.sunatResponseDesc,
  };

  // Solo se escriben si vienen con valor. Un reintento o una consulta de estado
  // pueden no devolver hash/XML/CDR, y sobreescribir con null borraría datos
  // buenos de una emisión anterior.
  if (result.hashCode) patch.hash_code = result.hashCode;
  if (result.xmlUrl) patch.xml_url = result.xmlUrl;
  if (result.cdrUrl) patch.cdr_url = result.cdrUrl;

  const { error } = await admin
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId);

  if (error) {
    throw new Error(
      `No se pudo persistir el resultado SUNAT del comprobante ${invoiceId}: ${error.message}`,
    );
  }
}

/**
 * Registra un intento de envío. Se llama SIEMPRE, haya ido bien o mal, porque
 * lo que hay que acotar es el número de llamadas al proveedor.
 */
export async function registerSunatAttempt(invoiceId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_increment_sunat_attempts", {
    p_invoice_id: invoiceId,
  });
  if (error) {
    console.error(
      `[sunat] No se pudo incrementar sunat_attempts de ${invoiceId}: ${error.message}`,
    );
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/**
 * Guarda solo el motivo del fallo cuando ni siquiera se llegó a obtener una
 * respuesta del proveedor (caída de red, timeout). No toca el estado: el
 * comprobante sigue `issued` y es candidato a reintento.
 */
export async function persistSunatError(
  invoiceId: string,
  message: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("invoices")
      .update({ sunat_response_desc: message })
      .eq("id", invoiceId);
  } catch {
    /* no bloquear la emisión por un fallo al registrar el error */
  }
}
