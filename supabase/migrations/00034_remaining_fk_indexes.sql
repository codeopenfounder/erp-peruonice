-- =====================================================================
-- Migration 00034: Remaining FK indexes (round 2)
-- Date: 2026-05-06
-- Description:
--   00032 covered 28 FKs but the advisor still flags 14 more, including
--   hot ones like invoice_items.product_id and invoices.cash_register_id.
--   This migration adds them all.
-- =====================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_authlog_cash_register_id      ON public.authorization_log(cash_register_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_arqueos_branch_id             ON public.cash_register_arqueos(branch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cro_tenant_id                 ON public.cash_register_openings(tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_registers_branch_id      ON public.cash_registers(branch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fact_user_cash_register_id    ON public.fact_user_assignments(cash_register_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_mov_branch_id             ON public.inventory_movements(branch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_items_product_id      ON public.invoice_items(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_series_branch_id      ON public.invoice_series(branch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_series_cash_register_id ON public.invoice_series(cash_register_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_promotion_id         ON public.invoices(promotion_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_cash_register_id     ON public.invoices(cash_register_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_links_product_id      ON public.payment_links(product_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_links_branch_id       ON public.payment_links(branch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promo_usage_tenant_id         ON public.promotion_usage(tenant_id);
