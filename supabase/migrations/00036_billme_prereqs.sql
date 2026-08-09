-- Migración 00036: Prerrequisitos para la migración a Billme
-- Idempotente: re-ejecutable sin error.
--
-- Cambios:
--   1. invoices.sunat_attempts — tope de reintentos del auto-retry del pull
--   2. Ubigeo del emisor (Billme lo exige y hoy está vacío)
--   3. Series propias para notas de crédito y débito
--
-- Contexto de (3): SUNAT NO obliga a que la nota tenga una serie distinta de la
-- del comprobante que modifica (Guía XML de Nota de Crédito UBL 2.1, sec. 4:
-- "salvo el primer carácter, no necesariamente debe coincidir"). Lo que SÍ es
-- obligatorio es que el primer carácter sea F si modifica factura y B si modifica
-- boleta (Anexo N.° 3 de la RS 097-2012, sust. por RS 114-2019), y que el
-- correlativo sea independiente por (tipo de documento + serie).
-- El bug que esto corrige es el CONTADOR compartido: como fn_next_correlative()
-- opera por fila de serie, hoy una NC sobre B001 consume el correlativo de las
-- boletas y abre huecos en su numeración.

-- ---------------------------------------------------------------------------
-- 1. Tope de reintentos
-- ---------------------------------------------------------------------------
-- autoRetrySunat() en /api/fact/sync/pull reintenta comprobantes en estado
-- 'issued' en CADA pull (cada 2 min) sin contador, sin backoff y sin
-- dead-letter. Un comprobante que SUNAT rechace de forma permanente se
-- reenviaría ~720 veces al día. El contador permite cortar sin introducir un
-- estado nuevo (que obligaría a tocar la UI del ERP y del POS).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sunat_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.sunat_attempts IS
  'Nº de envíos al proveedor SUNAT. El auto-retry del pull deja de reintentar al llegar al tope.';

-- Índice que sirve exactamente a la consulta del auto-retry.
CREATE INDEX IF NOT EXISTS idx_invoices_sunat_retry
  ON public.invoices (tenant_id, created_at)
  WHERE status = 'issued';

-- Incremento atómico: PostgREST no sabe expresar `col = col + 1`.
CREATE OR REPLACE FUNCTION public.fn_increment_sunat_attempts(p_invoice_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_attempts INTEGER;
BEGIN
  UPDATE public.invoices
  SET sunat_attempts = sunat_attempts + 1
  WHERE id = p_invoice_id
  RETURNING sunat_attempts INTO v_attempts;
  RETURN COALESCE(v_attempts, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Ubigeo del emisor
-- ---------------------------------------------------------------------------
-- Billme rechaza con 400 "The Ubigeo field is required" si falta (verificado
-- contra la API real). Hoy la columna existe pero está en cadena vacía, y la UI
-- ni siquiera renderiza un input para editarla.
UPDATE public.fact_config
SET ubigeo = '150130'          -- San Borja, Lima, Lima (INEI)
WHERE ruc = '20613509446'
  AND (ubigeo IS NULL OR btrim(ubigeo) = '');

-- ---------------------------------------------------------------------------
-- 3. Series de notas de crédito y débito
-- ---------------------------------------------------------------------------
-- cash_register_id queda en NULL a propósito: el pull baja todas las series
-- activas del tenant y create-invoice.ts resuelve por document_type con
-- fallback, así que una sola serie por tipo sirve a todas las cajas.
DO $$
DECLARE
  v_tenant UUID;
BEGIN
  FOR v_tenant IN
    SELECT DISTINCT tenant_id FROM public.invoice_series
    WHERE document_type IN ('boleta', 'factura')
  LOOP
    INSERT INTO public.invoice_series
      (tenant_id, series_code, document_type, current_correlative, cash_register_id, is_active)
    VALUES
      (v_tenant, 'FC01', 'nota_credito_factura', 0, NULL, true),
      (v_tenant, 'BC01', 'nota_credito_boleta',  0, NULL, true),
      (v_tenant, 'FD01', 'nota_debito_factura',  0, NULL, true),
      (v_tenant, 'BD01', 'nota_debito_boleta',   0, NULL, true)
    ON CONFLICT (tenant_id, series_code) DO NOTHING;
  END LOOP;
END $$;
