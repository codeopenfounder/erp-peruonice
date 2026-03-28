-- ============================================================
-- Migration 00026: Add authorization fields to cash_register_movements
-- Tracks who authorized cash withdrawals (supervisor/gerente PIN)
-- ============================================================

ALTER TABLE public.cash_register_movements
  ADD COLUMN IF NOT EXISTS authorized_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS authorized_name text;
