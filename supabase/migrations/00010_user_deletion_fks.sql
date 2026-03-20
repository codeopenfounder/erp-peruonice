-- =====================================================================
-- Migration 00010: Enable clean user deletion via FK ON DELETE SET NULL
-- Date: 2026-03-19
-- Description:
--   Make NOT NULL columns nullable for opened_by/audited_by so deleted
--   users don't leave orphaned records. Update all auth.users FKs to
--   ON DELETE SET NULL to preserve financial/audit records.
-- =====================================================================

-- ===== 1. MAKE NOT NULL COLUMNS NULLABLE =====
ALTER TABLE public.cash_register_openings ALTER COLUMN opened_by DROP NOT NULL;
ALTER TABLE public.inventory_audits ALTER COLUMN audited_by DROP NOT NULL;

-- ===== 2. UPDATE FKs TO ON DELETE SET NULL =====

-- cash_register_openings.opened_by
ALTER TABLE public.cash_register_openings
  DROP CONSTRAINT IF EXISTS cash_register_openings_opened_by_fkey,
  ADD CONSTRAINT cash_register_openings_opened_by_fkey
    FOREIGN KEY (opened_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- cash_register_openings.closed_by
ALTER TABLE public.cash_register_openings
  DROP CONSTRAINT IF EXISTS cash_register_openings_closed_by_fkey,
  ADD CONSTRAINT cash_register_openings_closed_by_fkey
    FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- invoices.cashier_id
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_cashier_id_fkey,
  ADD CONSTRAINT invoices_cashier_id_fkey
    FOREIGN KEY (cashier_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- invoices.created_by
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_created_by_fkey,
  ADD CONSTRAINT invoices_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- cash_register_movements.created_by
ALTER TABLE public.cash_register_movements
  DROP CONSTRAINT IF EXISTS cash_register_movements_created_by_fkey,
  ADD CONSTRAINT cash_register_movements_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- inventory_movements.created_by
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_created_by_fkey,
  ADD CONSTRAINT inventory_movements_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- inventory_audits.audited_by
ALTER TABLE public.inventory_audits
  DROP CONSTRAINT IF EXISTS inventory_audits_audited_by_fkey,
  ADD CONSTRAINT inventory_audits_audited_by_fkey
    FOREIGN KEY (audited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- reservations.created_by
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_created_by_fkey,
  ADD CONSTRAINT reservations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- reservations.cancelled_by
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_cancelled_by_fkey,
  ADD CONSTRAINT reservations_cancelled_by_fkey
    FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
