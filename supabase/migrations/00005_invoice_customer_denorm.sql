-- =====================================================================
-- Migration 00005: Denormalize customer data on invoices
-- Date: 2026-03-18
-- Description: Add customer document/name/address columns to invoices
--   for SUNAT compliance (preserve customer data at time of emission)
--   and to fix sync push INSERT failures (code sends these columns).
-- =====================================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_document_type text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_document_number text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_address text;
