-- =====================================================================
-- Migration 00032: Add indexes for unindexed foreign keys
-- Date: 2026-05-06
-- Description:
--   Postgres advisor flagged 28 foreign keys without indexes. Without
--   them, JOIN/lookup queries default to sequential scans and DELETEs
--   trigger full-table scans on each referencing table.
--   All indexes use CONCURRENTLY to avoid blocking writes.
-- =====================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_series_id              ON public.invoices(series_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_cashier_id             ON public.invoices(cashier_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_opening_id             ON public.invoices(opening_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_created_by             ON public.invoices(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_reference_invoice_id   ON public.invoices(reference_invoice_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_created_by                  ON public.cash_register_movements(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_authorized_by               ON public.cash_register_movements(authorized_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cro_opened_by                   ON public.cash_register_openings(opened_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cro_closed_by                   ON public.cash_register_openings(closed_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_registers_current_opening_id ON public.cash_registers(current_opening_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_arqueos_supervisor_id           ON public.cash_register_arqueos(supervisor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_arqueos_cashier_id              ON public.cash_register_arqueos(cashier_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_arqueos_created_by              ON public.cash_register_arqueos(created_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_mov_created_by              ON public.inventory_movements(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_audits_audited_by           ON public.inventory_audits(audited_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_efm_created_by                  ON public.expense_fund_movements(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_efm_authorized_by               ON public.expense_fund_movements(authorized_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_branches_manager_id             ON public.branches(manager_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_authlog_opening_id              ON public.authorization_log(opening_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_authlog_cashier_id              ON public.authorization_log(cashier_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_links_created_by        ON public.payment_links(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_links_reservation_id    ON public.payment_links(reservation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_links_invoice_id        ON public.payment_links(invoice_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promo_cat_filters_category_id   ON public.promotion_category_filters(category_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promo_tag_filters_tag_id        ON public.promotion_tag_filters(tag_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promo_usage_invoice_id          ON public.promotion_usage(invoice_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservations_created_by         ON public.reservations(created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservations_cancelled_by       ON public.reservations(cancelled_by);

-- Compound index for frequent filter pattern: status + tenant
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_tenant_status          ON public.invoices(tenant_id, status);

-- Index for notifyModuleAction lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_perms_tenant_module_view
  ON public.user_permissions(tenant_id, module_code) WHERE can_view = true;
