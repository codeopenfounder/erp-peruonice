-- =====================================================================
-- Migration 00008: DB Audit Cleanup
-- Date: 2026-03-19
-- Description:
--   1. Delete test users (Mauricio Soto, Giuseppe Capurro)
--   2. Add 'control_acceso' to profiles.cargo CHECK constraint
--   3. Drop ghost column profiles.pin_code (00003 never executed)
--   4. Add partial UNIQUE index on fact_user_assignments(tenant_id, pin_code)
--   5. Sync tenants.ruc/razon_social from fact_config
--   6. Drop unused tenant_branding.secondary_color
-- =====================================================================

-- ===== 1. DELETE TEST USERS AND THEIR DATA =====
-- Mauricio Soto: 1dd087dd-b99a-470a-959c-b1faa91ace18
-- Giuseppe Capurro: d5364e1b-e68f-460d-8e67-7add81b31d2f

-- Clean up test data created by these users (non-cascading FKs)
DELETE FROM public.invoice_items WHERE invoice_id IN (
  SELECT id FROM public.invoices WHERE cashier_id IN ('1dd087dd-b99a-470a-959c-b1faa91ace18','d5364e1b-e68f-460d-8e67-7add81b31d2f')
);
DELETE FROM public.cash_register_movements WHERE opening_id IN (
  SELECT id FROM public.cash_register_openings WHERE opened_by IN ('1dd087dd-b99a-470a-959c-b1faa91ace18','d5364e1b-e68f-460d-8e67-7add81b31d2f')
);
DELETE FROM public.invoices WHERE cashier_id IN ('1dd087dd-b99a-470a-959c-b1faa91ace18','d5364e1b-e68f-460d-8e67-7add81b31d2f');
-- Clear current_opening_id reference before deleting openings
UPDATE public.cash_registers SET current_opening_id = NULL WHERE current_opening_id IN (
  SELECT id FROM public.cash_register_openings WHERE opened_by IN ('1dd087dd-b99a-470a-959c-b1faa91ace18','d5364e1b-e68f-460d-8e67-7add81b31d2f')
);
DELETE FROM public.cash_register_openings WHERE opened_by IN ('1dd087dd-b99a-470a-959c-b1faa91ace18','d5364e1b-e68f-460d-8e67-7add81b31d2f');
UPDATE public.inventory_movements SET created_by = NULL WHERE created_by IN ('1dd087dd-b99a-470a-959c-b1faa91ace18','d5364e1b-e68f-460d-8e67-7add81b31d2f');

-- Now delete the users (CASCADE handles profiles, user_permissions, fact_user_assignments, notifications)
DELETE FROM auth.users WHERE id IN (
  '1dd087dd-b99a-470a-959c-b1faa91ace18',
  'd5364e1b-e68f-460d-8e67-7add81b31d2f'
);

-- ===== 2. ADD 'control_acceso' CARGO =====
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cargo_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_cargo_check
  CHECK (cargo IN ('gerente', 'supervisor', 'cajero', 'control_acceso'));

-- ===== 3. DROP GHOST COLUMN profiles.pin_code =====
-- Migration 00003 documented this but was never executed against the live DB.
-- Admin had "1234" in this column; all code reads PIN from fact_user_assignments.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_code;

-- ===== 4. PARTIAL UNIQUE INDEX ON PIN =====
-- Prevents duplicate PINs per tenant among active users.
-- Only app-level check existed before (allowed the "1234" duplicate).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_users_pin_unique
  ON public.fact_user_assignments(tenant_id, pin_code)
  WHERE is_active = true AND pin_code IS NOT NULL;

-- ===== 5. SYNC tenants.ruc/razon_social FROM fact_config =====
UPDATE public.tenants t
SET ruc = fc.ruc, razon_social = fc.razon_social
FROM public.fact_config fc
WHERE fc.tenant_id = t.id AND fc.is_active = true AND t.ruc IS NULL;

-- ===== 6. DROP UNUSED tenant_branding.secondary_color =====
-- Always NULL, never used in any code logic. Select queries already updated.
ALTER TABLE public.tenant_branding DROP COLUMN IF EXISTS secondary_color;
