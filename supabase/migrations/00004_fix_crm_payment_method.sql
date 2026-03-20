-- ============================================================================
-- Migration 00004: Fix cash_register_movements payment_method constraint
-- Problem: constraint only allows cash|card|transfer but invoices allow credit|mixed too
-- ============================================================================

ALTER TABLE cash_register_movements
DROP CONSTRAINT IF EXISTS cash_register_movements_payment_method_check;

ALTER TABLE cash_register_movements
ADD CONSTRAINT cash_register_movements_payment_method_check
CHECK (payment_method = ANY (ARRAY['cash','card','transfer','credit','mixed']));
