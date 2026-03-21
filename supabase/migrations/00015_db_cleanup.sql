-- ============================================================================
-- Migration 00015: DB Cleanup — drop unused tables and dead columns
-- Date: 2026-03-20
-- Description:
--   1. Drop promotion_groups table (never used — promotions use combo_items)
--   2. Drop dead columns from invoices (never populated in application code)
--   3. Document products.branch_id (exists via dashboard, needs migration record)
-- ============================================================================

-- 1. Drop unused promotion_groups table
--    0 references in poi-erp/src, kronos-fact/src, poi-lector/src
--    The promotion system uses promotion_combo_items instead
DROP TABLE IF EXISTS public.promotion_groups;

-- 2. Drop dead columns from invoices
--    due_date: never set, never read (B2C business, no credit terms)
--    payment_terms: always null in all push/sync flows
--    qr_data: never populated (QR generated from hash_code on frontend)
--    pdf_url: never populated (system uses xml_url/cdr_url from SUNAT)
--    sunat_ticket: never populated in any code path
ALTER TABLE public.invoices DROP COLUMN IF EXISTS due_date;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS payment_terms;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS qr_data;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS pdf_url;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS sunat_ticket;

-- 3. Ensure products.branch_id exists (may already exist via Supabase dashboard)
--    Required by sync pull and SQLite schema, but no migration record exists
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_branch ON public.products(branch_id);
