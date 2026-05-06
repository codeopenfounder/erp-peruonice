/**
 * Storage helpers para XML/CDR de comprobantes SUNAT.
 * Bucket: sunat-documents (privado, signed URLs largos).
 */

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "sunat-documents";
// Signed URL válido por 10 años (SUNAT exige conservar 5 años; damos margen).
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export type SunatDocumentKind = "xml" | "cdr";

/**
 * Construye el path determinístico para un documento SUNAT.
 * Particiona por mes para evitar carpetas con miles de archivos.
 *
 * Ejemplo: "abc-tenant/2026-05/inv-uuid.xml"
 */
export function buildSunatPath(
  tenantId: string,
  invoiceId: string,
  kind: SunatDocumentKind,
  emittedAt: Date = new Date(),
): string {
  const yyyyMm = emittedAt.toLocaleDateString("en-CA", {
    timeZone: "America/Lima",
  }).slice(0, 7);
  const ext = kind === "xml" ? "xml" : "cdr.zip";
  return `${tenantId}/${yyyyMm}/${invoiceId}.${ext}`;
}

export async function uploadSunatDocument(
  data: Buffer | Uint8Array,
  path: string,
  contentType: "application/xml" | "application/zip",
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, data, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
  if (error) {
    throw new Error(`Storage upload failed (${path}): ${error.message}`);
  }
}

export async function getSignedSunatUrl(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Signed URL failed (${path}): ${error?.message ?? "no URL"}`,
    );
  }
  return data.signedUrl;
}

/**
 * Sube el documento y devuelve su signed URL en una sola operación.
 * Si el upload falla, propaga el error; quien llama decide qué hacer.
 */
export async function uploadAndSign(
  data: Buffer | Uint8Array,
  path: string,
  contentType: "application/xml" | "application/zip",
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  await uploadSunatDocument(data, path, contentType);
  return getSignedSunatUrl(path, ttlSeconds);
}
