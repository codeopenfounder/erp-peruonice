-- Migración 00037: efectos de las notas y re-emisión sin doble cobro
-- Idempotente: re-ejecutable sin error.
--
-- Cambios:
--   1. invoices.reissue_of_invoice_id — la re-emisión hereda cobro y stock
--   2. CHECK sobre invoices.reference_reason — catálogos 09 y 10
--   3. Unicidad del arqueo de cierre por apertura

-- ---------------------------------------------------------------------------
-- 1. Re-emisión
-- ---------------------------------------------------------------------------
-- Tras una NC motivo 02 (error en el RUC), POI Fact re-emite el comprobante con
-- el RUC correcto. Hasta ahora lo emitía como una venta normal, así que volvía a
-- descontar stock y volvía a registrar un ingreso en caja: el cliente pagaba una
-- vez y la caja registraba dos. Lo correcto es que la re-emisión herede ambos
-- del original, de modo que la NC y la nueva factura se neteen y el efecto en
-- resultados sea cero.
--
-- ON DELETE SET NULL, no CASCADE: borrar el original jamás debe llevarse por
-- delante un comprobante emitido a SUNAT.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reissue_of_invoice_id UUID
    REFERENCES public.invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.reissue_of_invoice_id IS
  'Comprobante que este documento re-emite tras una NC motivo 02. Presente ⇒ no genera movimiento de caja ni movimiento de stock: los registró el original.';

CREATE INDEX IF NOT EXISTS idx_invoices_reissue_of
  ON public.invoices (reissue_of_invoice_id)
  WHERE reissue_of_invoice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Motivos válidos de nota
-- ---------------------------------------------------------------------------
-- `reference_reason` guarda el código del catálogo 09 (notas de crédito) o del
-- 10 (notas de débito) y no tenía ninguna restricción, pese a que de él dependen
-- el movimiento de caja y la dirección del inventario. Un código inesperado
-- caía silenciosamente en "no hagas nada".
--
-- Se restringe a los códigos que el sistema sabe interpretar, que son los que
-- declara src/lib/sunat/note-effects.ts. Los códigos 11 (exportación), 12 (IVAP)
-- y 13 (monto neto pendiente) del catálogo 09 quedan fuera a propósito: no
-- aplican a este negocio y añadirlos sin efecto definido reabriría el agujero.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_reference_reason_check'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_reference_reason_check CHECK (
        reference_reason IS NULL
        OR (document_type = 'nota_credito'
            AND reference_reason IN ('01','02','03','04','05','06','07','08','09','10'))
        OR (document_type = 'nota_debito'
            AND reference_reason IN ('01','02','03'))
        OR document_type NOT IN ('nota_credito','nota_debito')
      ) NOT VALID;
  END IF;
END $$;

-- NOT VALID + VALIDATE por separado: la validación no bloquea escrituras, y si
-- hubiera filas históricas fuera del catálogo el fallo es explícito y aislado en
-- vez de tumbar toda la migración.
DO $$
BEGIN
  ALTER TABLE public.invoices VALIDATE CONSTRAINT invoices_reference_reason_check;
EXCEPTION WHEN check_violation THEN
  RAISE WARNING 'invoices_reference_reason_check no validó: hay comprobantes con reference_reason fuera de los catálogos 09/10. La restricción queda activa para filas nuevas.';
END $$;

-- ---------------------------------------------------------------------------
-- 3. Un solo arqueo de cierre por apertura
-- ---------------------------------------------------------------------------
-- createCierreArqueo() se invoca fire-and-forget desde /api/fact/heartbeat y el
-- POS reenvía el heartbeat de cierre ante cualquier fallo de red. El insert era
-- plano y la tabla no tenía ninguna restricción, así que cada reenvío creaba
-- otro arqueo de cierre para la misma apertura.
--
-- La unicidad se expresa con una columna GENERADA en vez de un índice parcial
-- porque PostgREST no sabe emitir el predicado (`... WHERE type = 'cierre'`) que
-- Postgres exige para inferir un índice parcial en ON CONFLICT. La columna vale
-- NULL en los arqueos sorpresa, y los NULL no colisionan entre sí: varios
-- arqueos sorpresa por apertura siguen siendo válidos, que es lo que se quiere.
ALTER TABLE public.cash_register_arqueos
  ADD COLUMN IF NOT EXISTS cierre_opening_id UUID
    GENERATED ALWAYS AS (CASE WHEN type = 'cierre' THEN opening_id END) STORED;

COMMENT ON COLUMN public.cash_register_arqueos.cierre_opening_id IS
  'Igual a opening_id sólo en arqueos de cierre; NULL en los de sorpresa. Existe para dar unicidad al cierre sin impedir varios arqueos sorpresa por apertura.';

-- Los duplicados historicos se colapsan al mas reciente antes de crear el
-- indice; si no, la creacion falla y la migracion no es re-ejecutable.
DELETE FROM public.cash_register_arqueos a
WHERE a.type = 'cierre'
  AND a.opening_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.cash_register_arqueos b
    WHERE b.type = 'cierre'
      AND b.opening_id = a.opening_id
      AND (b.created_at > a.created_at
           OR (b.created_at = a.created_at AND b.id > a.id))
  );

-- Índice ÍNTEGRO, no parcial: un índice parcial tampoco sería inferible desde
-- PostgREST. No hace falta filtrar los NULL, porque en un índice único los NULL
-- no colisionan entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS idx_arqueos_cierre_opening_unique
  ON public.cash_register_arqueos (cierre_opening_id);
