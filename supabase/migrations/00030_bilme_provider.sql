-- Migración 00030: Soporte para proveedor Bilme + bucket Storage para XML/CDR
-- Idempotente: re-ejecutable sin error.
--
-- Cambios:
--   1. Ampliar el constraint provider en fact_config para incluir 'bilme'
--   2. Agregar columna invoices.sunat_ticket_status para tracking de tickets async
--   3. Crear bucket privado 'sunat-documents' para almacenar XML/CDR de Bilme
--   4. RLS: solo service_role puede leer/escribir directo. Usuarios usan signed URLs.

-- 1. Ampliar constraint provider
ALTER TABLE public.fact_config DROP CONSTRAINT IF EXISTS fact_config_provider_check;
ALTER TABLE public.fact_config ADD CONSTRAINT fact_config_provider_check
  CHECK (provider IN ('apisunat', 'nubefact', 'efact', 'bilme'));

-- 2. Estado de ticket asíncrono Bilme (anulaciones vía RA con polling)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sunat_ticket_status text;
COMMENT ON COLUMN public.invoices.sunat_ticket_status IS
  'Bilme async: pending|completed|failed. NULL si no aplica (apisunat o no anulado).';

-- 3. Bucket privado para XML/CDR de SUNAT
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sunat-documents',
  'sunat-documents',
  false,
  5242880,
  ARRAY['application/xml','text/xml','application/zip']
)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS policies del bucket
DROP POLICY IF EXISTS "service_role_all_sunat_documents" ON storage.objects;
CREATE POLICY "service_role_all_sunat_documents"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'sunat-documents')
  WITH CHECK (bucket_id = 'sunat-documents');
