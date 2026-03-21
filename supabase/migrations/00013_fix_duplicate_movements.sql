-- 00013_fix_duplicate_movements.sql
-- Fix: movimientos duplicados creados por sync/push (invoice processing + standalone movement)

-- A. Eliminar duplicados existentes: conservar el creado por invoice processing ("Venta ...")
-- y eliminar el enviado por poi-fact (con descripción tipo "B001-00000071")
DELETE FROM public.cash_register_movements
WHERE id IN (
  SELECT m.id FROM public.cash_register_movements m
  INNER JOIN (
    SELECT invoice_id FROM public.cash_register_movements
    WHERE invoice_id IS NOT NULL
    GROUP BY invoice_id HAVING COUNT(*) > 1
  ) dups ON m.invoice_id = dups.invoice_id
  WHERE m.description NOT LIKE 'Venta %'
    AND m.description NOT LIKE 'Devolucion %'
    AND m.description NOT LIKE 'Ajuste %'
);

-- B. Limpiar remanentes (si ambos tienen "Venta", conservar el más antiguo)
DELETE FROM public.cash_register_movements
WHERE id IN (
  SELECT m.id FROM public.cash_register_movements m
  INNER JOIN (
    SELECT invoice_id, MIN(created_at) AS first_ts
    FROM public.cash_register_movements
    WHERE invoice_id IS NOT NULL
    GROUP BY invoice_id HAVING COUNT(*) > 1
  ) dups ON m.invoice_id = dups.invoice_id AND m.created_at > dups.first_ts
);

-- C. Índice único parcial para prevenir duplicados futuros
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_invoice_unique
  ON public.cash_register_movements(invoice_id)
  WHERE invoice_id IS NOT NULL;

-- D. Agregar tipo nd_charge al CHECK (alinear con poi-fact)
ALTER TABLE public.cash_register_movements
  DROP CONSTRAINT IF EXISTS cash_register_movements_type_check;

ALTER TABLE public.cash_register_movements
  ADD CONSTRAINT cash_register_movements_type_check
  CHECK (type IN ('sale','cash_in','cash_out','income','expense','refund','petty_cash_in','nd_charge'));
