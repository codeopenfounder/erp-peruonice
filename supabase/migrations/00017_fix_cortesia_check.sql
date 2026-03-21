-- ============================================================================
-- Migration 00017: Fix cortesia_reason CHECK constraint
-- Date: 2026-03-21
-- Description:
--   The old CHECK restricted cortesia_reason to a fixed list of 4 values.
--   But the "Otro" option allows free-text input, which violates the constraint
--   and causes invoice_items INSERT to fail silently → orphan invoices with 0 items.
--   Fix: allow any non-null value when is_cortesia = true.
-- ============================================================================

-- Drop BOTH constraints: the auto-named original (invoice_items_check) AND any named version
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_check;
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_cortesia_reason_check;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_cortesia_reason_check
  CHECK (is_cortesia = false OR cortesia_reason IS NOT NULL);
