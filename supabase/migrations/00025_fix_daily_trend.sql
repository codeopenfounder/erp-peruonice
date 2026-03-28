-- ============================================================================
-- Migration 00025: Fix daily trend bug + hourly product sales chart
-- Date: 2026-03-27
-- Description:
--   1. New fn_kpi_daily_trend: queries invoices directly (bypasses snapshots)
--   2. New fn_kpi_hourly_product_sales: per-product hourly breakdown
--   3. Cleanup duplicate aggregate snapshot rows (NULL branch_id issue)
--   4. Fix unique constraint for future snapshot generation
-- ============================================================================

-- =============================================================
-- 1. fn_kpi_daily_trend (replaces snapshot-based trend query)
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_kpi_daily_trend(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    trend_date                date,
    total_revenue             numeric,
    transaction_count         bigint,
    avg_ticket                numeric,
    voided_amount             numeric,
    cortesia_amount           numeric,
    promotion_discount_total  numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH sales AS (
        SELECT
            i.issue_date,
            COALESCE(SUM(CASE
                WHEN i.status NOT IN ('voided','draft') AND i.document_type NOT IN ('nota_credito','nota_debito')
                THEN i.total ELSE 0 END), 0) AS rev,
            COUNT(*) FILTER (WHERE i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito')) AS txc,
            COALESCE(SUM(i.total) FILTER (WHERE i.status = 'voided' OR i.document_type = 'nota_credito'), 0) AS voided,
            COALESCE(SUM(i.promotion_discount) FILTER (WHERE i.promotion_id IS NOT NULL
                AND i.status NOT IN ('voided','draft')), 0) AS promo_disc
        FROM invoices i
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
        GROUP BY i.issue_date
    ),
    cortesias AS (
        SELECT
            inv.issue_date,
            COALESCE(SUM(ii.original_unit_price * ii.quantity - ii.total), 0) AS cortesia_amt
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id
        LEFT JOIN cash_registers cr ON inv.cash_register_id = cr.id
        WHERE inv.tenant_id = p_tenant_id
          AND ii.is_cortesia = true
          AND inv.status NOT IN ('voided','draft')
          AND inv.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
        GROUP BY inv.issue_date
    )
    SELECT
        s.issue_date,
        s.rev,
        s.txc,
        CASE WHEN s.txc > 0 THEN ROUND(s.rev / s.txc, 2) ELSE 0 END,
        s.voided,
        COALESCE(c.cortesia_amt, 0),
        s.promo_disc
    FROM sales s
    LEFT JOIN cortesias c ON s.issue_date = c.issue_date
    ORDER BY s.issue_date;
$$;

-- =============================================================
-- 2. fn_kpi_hourly_product_sales (per-product hourly breakdown)
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_kpi_hourly_product_sales(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE,
    p_product_id uuid DEFAULT NULL
) RETURNS TABLE (
    hour_of_day   integer,
    quantity_sold  numeric,
    revenue        numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH daily_hours AS (
        SELECT
            EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')::integer AS hod,
            ii.quantity,
            ii.total,
            i.issue_date
        FROM invoices i
        JOIN invoice_items ii ON ii.invoice_id = i.id
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id
          AND i.status NOT IN ('voided', 'draft')
          AND i.document_type NOT IN ('nota_credito', 'nota_debito')
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
          AND ii.is_cortesia = false
          AND (p_product_id IS NULL OR ii.product_id = p_product_id OR ii.supply_id = p_product_id)
    ),
    num_days AS (
        SELECT GREATEST(COUNT(DISTINCT issue_date), 1)::numeric AS d FROM daily_hours
    )
    SELECT
        dh.hod,
        CASE WHEN (SELECT d FROM num_days) = 1 THEN COALESCE(SUM(dh.quantity), 0)
             ELSE ROUND(COALESCE(SUM(dh.quantity), 0) / (SELECT d FROM num_days), 2) END,
        CASE WHEN (SELECT d FROM num_days) = 1 THEN COALESCE(SUM(dh.total), 0)
             ELSE ROUND(COALESCE(SUM(dh.total), 0) / (SELECT d FROM num_days), 2) END
    FROM daily_hours dh
    GROUP BY dh.hod
    ORDER BY dh.hod;
$$;

-- =============================================================
-- 3. Cleanup duplicate aggregate snapshot rows
-- =============================================================
-- Delete ALL aggregate rows (branch_id IS NULL) - they'll be regenerated correctly
DELETE FROM public.kpi_daily_snapshots WHERE branch_id IS NULL;

-- =============================================================
-- 4. Fix unique constraint for NULL branch_id
-- =============================================================
-- Drop old constraint that doesn't handle NULLs
ALTER TABLE public.kpi_daily_snapshots DROP CONSTRAINT IF EXISTS kpi_daily_snapshots_tenant_id_branch_id_snapshot_date_key;

-- New unique index that treats NULL as a value
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snap_unique_coalesce
    ON public.kpi_daily_snapshots(
        tenant_id,
        COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'),
        snapshot_date
    );

-- =============================================================
-- 5. Regenerate clean aggregate rows
-- =============================================================
-- Re-insert aggregate rows from existing branch data
INSERT INTO public.kpi_daily_snapshots (
    tenant_id, branch_id, snapshot_date,
    total_revenue, transaction_count, avg_ticket,
    revenue_cash, revenue_card, revenue_transfer, revenue_credit, revenue_mixed,
    voided_count, voided_amount, cortesia_count, cortesia_amount,
    promotion_tx_count, promotion_discount_total,
    inventory_shrinkage_value, inventory_waste_value,
    attendance_entries, attendance_scans, attendance_entries_sold,
    total_expenses, expense_count
)
SELECT
    tenant_id, NULL, snapshot_date,
    SUM(total_revenue), SUM(transaction_count),
    CASE WHEN SUM(transaction_count) > 0 THEN ROUND(SUM(total_revenue)/SUM(transaction_count), 2) ELSE 0 END,
    SUM(revenue_cash), SUM(revenue_card), SUM(revenue_transfer), SUM(revenue_credit), SUM(revenue_mixed),
    SUM(voided_count), SUM(voided_amount), SUM(cortesia_count), SUM(cortesia_amount),
    SUM(promotion_tx_count), SUM(promotion_discount_total),
    SUM(inventory_shrinkage_value), SUM(inventory_waste_value),
    SUM(attendance_entries), SUM(attendance_scans), SUM(attendance_entries_sold),
    SUM(total_expenses), SUM(expense_count)
FROM public.kpi_daily_snapshots
WHERE branch_id IS NOT NULL
GROUP BY tenant_id, snapshot_date
ON CONFLICT DO NOTHING;
