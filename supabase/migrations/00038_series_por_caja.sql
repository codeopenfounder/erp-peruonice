-- Migración 00038: una serie propia por caja registradora
-- Idempotente: re-ejecutable sin error.
--
-- Cambios:
--   1. Serie de boleta y de factura propias para cada caja activa que no tenga
--   2. Índice único parcial que impide dos series activas del mismo tipo por caja
--   3. Backfill de invoice_series.branch_id desde cash_registers.branch_id
--
-- El problema que resuelve
-- ------------------------
-- createCashRegister() creaba la caja y NO creaba ninguna serie. El POS resuelve
-- la serie con `find(tipo && caja) || find(tipo)` (kronos-fact
-- src/lib/invoicing/create-invoice.ts), así que una caja sin serie propia cae al
-- fallback y emite sobre la serie de otra caja. Con dos cajas activas eso
-- significa dos terminales compartiendo un mismo contador: el correlativo que el
-- POS calcula en local para imprimir el ticket y el que fn_next_correlative()
-- asigna en el servidor pueden divergir, y el número entregado al cliente deja de
-- ser el del comprobante real.
--
-- SUNAT no exige una serie por caja, pero sí exige que el correlativo sea único e
-- independiente por (tipo de documento + serie). Una serie por caja es la forma
-- estándar de conseguirlo con emisión concurrente, y es lo que el esquema ya
-- preveía: invoice_series.cash_register_id existe desde 00001.
--
-- Las series de notas (FC01/BC01/FD01/BD01 de la migración 00036) NO se replican
-- por caja a propósito: su correlativo lo asigna siempre el servidor en el push,
-- nunca se imprime un número calculado en local antes de sincronizar, así que
-- compartir la serie entre cajas no puede producir divergencia.

-- ---------------------------------------------------------------------------
-- 1. Series por caja
-- ---------------------------------------------------------------------------
-- El sufijo sale del código de la caja (CAJA-01 -> 001, CAJA-02 -> 002), de modo
-- que B002/F002 corresponden inequívocamente a CAJA-02. Si el código no encaja
-- con 'CAJA-NN' se salta la caja: es preferible dejarla sin serie propia (y por
-- tanto con el fallback de hoy) que inventar un código de serie ambiguo.
DO $$
DECLARE
  r RECORD;
  v_suffix TEXT;
  v_boleta TEXT;
  v_factura TEXT;
BEGIN
  FOR r IN
    SELECT cr.id, cr.tenant_id, cr.code, cr.branch_id
    FROM public.cash_registers cr
    WHERE cr.is_active
      AND cr.code ~ '^CAJA-[0-9]+$'
    ORDER BY cr.code
  LOOP
    v_suffix  := lpad((regexp_match(r.code, '^CAJA-([0-9]+)$'))[1], 3, '0');
    v_boleta  := 'B' || v_suffix;
    v_factura := 'F' || v_suffix;

    -- Sólo se crea si esa caja no tiene ya una serie activa de ese tipo. El
    -- ON CONFLICT cubre además el caso de que el código de serie ya exista
    -- atado a otra caja (idx_invoice_series_tenant_code es único por tenant).
    IF NOT EXISTS (
      SELECT 1 FROM public.invoice_series s
      WHERE s.tenant_id = r.tenant_id
        AND s.cash_register_id = r.id
        AND s.document_type = 'boleta'
        AND s.is_active
    ) THEN
      INSERT INTO public.invoice_series
        (tenant_id, series_code, document_type, current_correlative, branch_id, cash_register_id, is_active)
      VALUES
        (r.tenant_id, v_boleta, 'boleta', 0, r.branch_id, r.id, true)
      ON CONFLICT (tenant_id, series_code) DO NOTHING;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.invoice_series s
      WHERE s.tenant_id = r.tenant_id
        AND s.cash_register_id = r.id
        AND s.document_type = 'factura'
        AND s.is_active
    ) THEN
      INSERT INTO public.invoice_series
        (tenant_id, series_code, document_type, current_correlative, branch_id, cash_register_id, is_active)
      VALUES
        (r.tenant_id, v_factura, 'factura', 0, r.branch_id, r.id, true)
      ON CONFLICT (tenant_id, series_code) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Una sola serie activa por (tenant, tipo, caja)
-- ---------------------------------------------------------------------------
-- Hasta ahora el único UNIQUE era (tenant_id, series_code), así que nada impedía
-- dos series de boleta activas para la misma caja — y entonces el `find()` del
-- POS elegiría una u otra según el orden físico de la tabla SQLite, que no está
-- garantizado. Parcial sobre cash_register_id NOT NULL para no estorbar a las
-- series compartidas de notas, que van con caja NULL a propósito.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_series_register_type_active
  ON public.invoice_series (tenant_id, document_type, cash_register_id)
  WHERE cash_register_id IS NOT NULL AND is_active;

-- ---------------------------------------------------------------------------
-- 3. Backfill de branch_id
-- ---------------------------------------------------------------------------
-- invoice_series.branch_id existe desde 00001 y estaba SIEMPRE en NULL: la UI lo
-- mandaba en el payload pero invoiceSeriesSchema no lo declaraba y Zod lo
-- descartaba en silencio. La sede de una serie no es un dato independiente —- es
-- la de su caja —- así que se deriva en vez de pedirse.
UPDATE public.invoice_series s
SET branch_id = cr.branch_id
FROM public.cash_registers cr
WHERE s.cash_register_id = cr.id
  AND s.branch_id IS DISTINCT FROM cr.branch_id;

COMMENT ON COLUMN public.invoice_series.branch_id IS
  'Derivado de cash_registers.branch_id. NULL en las series compartidas (notas), que no están atadas a una caja.';
