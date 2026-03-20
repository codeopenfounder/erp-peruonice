-- =====================================================================
-- Migration 00011: Add deposit_amount to cash_register_openings
-- Date: 2026-03-19
-- Description:
--   Tracks how much cash the user BROUGHT at opening (their deposit),
--   separate from accumulated cash already in the register.
--   opening_amount = accumulated + deposit_amount
--   Used for withdrawal validation: user can withdraw at least their deposit.
-- =====================================================================

ALTER TABLE public.cash_register_openings
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2) NOT NULL DEFAULT 0;
