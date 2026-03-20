-- Migration 00012: Fix movement types + add missing cash_register_id column
-- Applied: 2026-03-20

-- 1. Fix movement type constraint
-- Code (POI Fact + ERP) uses 'income'/'expense', but CHECK only allowed 'cash_in'/'cash_out'
ALTER TABLE public.cash_register_movements
  DROP CONSTRAINT cash_register_movements_type_check;

ALTER TABLE public.cash_register_movements
  ADD CONSTRAINT cash_register_movements_type_check
  CHECK (type IN ('sale','cash_in','cash_out','income','expense','refund','petty_cash_in'));

-- 2. Add missing cash_register_id column
-- This column exists in SQLite (POI Fact) but was never added to Supabase.
-- Without it, getGastosMovements() fails because it selects this column.
ALTER TABLE public.cash_register_movements
  ADD COLUMN IF NOT EXISTS cash_register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL;

-- 3. Backfill from the opening's cash_register_id
UPDATE public.cash_register_movements m
SET cash_register_id = o.cash_register_id
FROM public.cash_register_openings o
WHERE m.opening_id = o.id
  AND m.cash_register_id IS NULL;

-- 4. Index for queries that filter by cash_register_id
CREATE INDEX IF NOT EXISTS idx_cash_register_movements_register
  ON public.cash_register_movements(cash_register_id);
