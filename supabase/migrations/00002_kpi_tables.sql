-- =====================================================================
-- POI KPI System - Migration: 00002_kpi_tables.sql
-- Description: Tables, indexes, functions and RLS for KPI dashboard
-- =====================================================================

-- =============================================================
-- 1. NEW TABLES
-- =============================================================

-- visitor_attendance: QR-based entry/exit tracking (for future use)
CREATE TABLE IF NOT EXISTS public.visitor_attendance (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id       uuid        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    scan_type       text        NOT NULL CHECK (scan_type IN ('entry','exit')),
    scanned_at      timestamptz NOT NULL DEFAULT now(),
    qr_code         text,
    ticket_type     text        CHECK (ticket_type IN ('general','vip','cortesia','evento','otro')),
    customer_id     uuid        REFERENCES public.customers(id) ON DELETE SET NULL,
    session_id      uuid,
    notes           text,
    registered_by   uuid        REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_att_tenant ON public.visitor_attendance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_visitor_att_branch_date ON public.visitor_attendance(branch_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_visitor_att_tenant_date ON public.visitor_attendance(tenant_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_visitor_att_session ON public.visitor_attendance(session_id) WHERE session_id IS NOT NULL;

-- kpi_daily_snapshots: Pre-computed daily aggregates
CREATE TABLE IF NOT EXISTS public.kpi_daily_snapshots (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id                   uuid        REFERENCES public.branches(id) ON DELETE CASCADE,
    snapshot_date               date        NOT NULL,
    -- Module 1: Sales
    total_revenue               numeric(14,2) NOT NULL DEFAULT 0,
    transaction_count           integer     NOT NULL DEFAULT 0,
    avg_ticket                  numeric(12,2) NOT NULL DEFAULT 0,
    revenue_cash                numeric(14,2) NOT NULL DEFAULT 0,
    revenue_card                numeric(14,2) NOT NULL DEFAULT 0,
    revenue_transfer            numeric(14,2) NOT NULL DEFAULT 0,
    revenue_credit              numeric(14,2) NOT NULL DEFAULT 0,
    revenue_mixed               numeric(14,2) NOT NULL DEFAULT 0,
    -- Module 3: Operational Efficiency
    voided_count                integer     NOT NULL DEFAULT 0,
    voided_amount               numeric(14,2) NOT NULL DEFAULT 0,
    cortesia_count              integer     NOT NULL DEFAULT 0,
    cortesia_amount             numeric(14,2) NOT NULL DEFAULT 0,
    promotion_tx_count          integer     NOT NULL DEFAULT 0,
    promotion_discount_total    numeric(14,2) NOT NULL DEFAULT 0,
    -- Module 4: Inventory
    inventory_shrinkage_value   numeric(14,2) NOT NULL DEFAULT 0,
    inventory_waste_value       numeric(14,2) NOT NULL DEFAULT 0,
    computed_at                 timestamptz NOT NULL DEFAULT now(),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, branch_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_kpi_snap_tenant_date ON public.kpi_daily_snapshots(tenant_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_kpi_snap_branch_date ON public.kpi_daily_snapshots(branch_id, snapshot_date);

-- =============================================================
-- 2. NEW INDEXES ON EXISTING TABLES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_invoice_items_cortesia ON public.invoice_items(invoice_id) WHERE is_cortesia = true;
CREATE INDEX IF NOT EXISTS idx_invoices_promotion ON public.invoices(tenant_id, issue_date) WHERE promotion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_voided ON public.invoices(tenant_id, issue_date) WHERE status = 'voided';
CREATE INDEX IF NOT EXISTS idx_invoices_payment ON public.invoices(tenant_id, payment_method, issue_date) WHERE status != 'voided';
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(tenant_id, created_at);

-- =============================================================
-- 3. RLS POLICIES
-- =============================================================

ALTER TABLE public.visitor_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.visitor_attendance FOR SELECT TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_insert" ON public.visitor_attendance FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_update" ON public.visitor_attendance FOR UPDATE TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_delete" ON public.visitor_attendance FOR DELETE TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());

CREATE POLICY "tenant_select" ON public.kpi_daily_snapshots FOR SELECT TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_insert" ON public.kpi_daily_snapshots FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_update" ON public.kpi_daily_snapshots FOR UPDATE TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_delete" ON public.kpi_daily_snapshots FOR DELETE TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());

-- =============================================================
-- 4. SQL FUNCTIONS FOR KPI CALCULATION
-- =============================================================

-- 4.1 fn_kpi_sales_summary: Core sales KPIs for a date range
CREATE OR REPLACE FUNCTION public.fn_kpi_sales_summary(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    total_revenue       numeric,
    transaction_count   bigint,
    avg_ticket          numeric,
    revenue_cash        numeric,
    revenue_card        numeric,
    revenue_transfer    numeric,
    revenue_credit      numeric,
    revenue_mixed       numeric,
    facturas_count      bigint,
    boletas_count       bigint,
    tickets_count       bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT
        COALESCE(SUM(CASE
            WHEN i.document_type = 'nota_credito' THEN -i.total
            ELSE i.total
        END), 0) AS total_revenue,
        COUNT(*) FILTER (WHERE i.document_type NOT IN ('nota_credito','nota_debito')) AS transaction_count,
        CASE
            WHEN COUNT(*) FILTER (WHERE i.document_type NOT IN ('nota_credito','nota_debito')) > 0
            THEN ROUND(
                COALESCE(SUM(CASE WHEN i.document_type NOT IN ('nota_credito','nota_debito') THEN i.total ELSE 0 END), 0)
                / COUNT(*) FILTER (WHERE i.document_type NOT IN ('nota_credito','nota_debito')),
            2)
            ELSE 0
        END AS avg_ticket,
        COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'cash' AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
        COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'card' AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
        COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'transfer' AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
        COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'credit' AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
        COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'mixed' AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
        COUNT(*) FILTER (WHERE i.document_type = 'factura'),
        COUNT(*) FILTER (WHERE i.document_type = 'boleta'),
        COUNT(*) FILTER (WHERE i.document_type = 'ticket')
    FROM public.invoices i
    LEFT JOIN public.cash_registers cr ON i.cash_register_id = cr.id
    WHERE i.tenant_id = p_tenant_id
      AND i.status NOT IN ('voided', 'draft')
      AND i.issue_date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id);
$$;

-- 4.2 fn_kpi_hourly_sales: Sales breakdown by hour of day
CREATE OR REPLACE FUNCTION public.fn_kpi_hourly_sales(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    hour_of_day     integer,
    revenue         numeric,
    tx_count        bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT
        EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')::integer AS hour_of_day,
        COALESCE(SUM(i.total), 0) AS revenue,
        COUNT(*) AS tx_count
    FROM public.invoices i
    LEFT JOIN public.cash_registers cr ON i.cash_register_id = cr.id
    WHERE i.tenant_id = p_tenant_id
      AND i.status NOT IN ('voided', 'draft')
      AND i.document_type NOT IN ('nota_credito','nota_debito')
      AND i.issue_date = p_date
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    GROUP BY EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')
    ORDER BY hour_of_day;
$$;

-- 4.3 fn_kpi_product_ranking: Top and bottom products by sales
CREATE OR REPLACE FUNCTION public.fn_kpi_product_ranking(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
    p_date_to date DEFAULT CURRENT_DATE,
    p_limit integer DEFAULT 10,
    p_order text DEFAULT 'desc'
) RETURNS TABLE (
    product_id      uuid,
    product_name    text,
    product_sku     text,
    units_sold      numeric,
    total_revenue   numeric,
    pct_of_total    numeric,
    avg_unit_price  numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH period_total AS (
        SELECT COALESCE(SUM(ii.total), 0) AS grand_total
        FROM public.invoice_items ii
        JOIN public.invoices i ON ii.invoice_id = i.id
        LEFT JOIN public.cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id
          AND i.status NOT IN ('voided','draft')
          AND i.document_type NOT IN ('nota_credito','nota_debito')
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
          AND ii.is_cortesia = false
    ),
    ranked AS (
        SELECT
            COALESCE(ii.product_id, ii.supply_id) AS product_id,
            ii.description AS product_name,
            COALESCE(p.sku, s.sku, '') AS product_sku,
            SUM(ii.quantity) AS units_sold,
            SUM(ii.total) AS total_revenue,
            CASE
                WHEN (SELECT grand_total FROM period_total) > 0
                THEN ROUND(SUM(ii.total) / (SELECT grand_total FROM period_total) * 100, 2)
                ELSE 0
            END AS pct_of_total,
            CASE
                WHEN SUM(ii.quantity) > 0
                THEN ROUND(SUM(ii.total) / SUM(ii.quantity), 2)
                ELSE 0
            END AS avg_unit_price
        FROM public.invoice_items ii
        JOIN public.invoices i ON ii.invoice_id = i.id
        LEFT JOIN public.cash_registers cr ON i.cash_register_id = cr.id
        LEFT JOIN public.products p ON ii.product_id = p.id
        LEFT JOIN public.supplies s ON ii.supply_id = s.id
        WHERE i.tenant_id = p_tenant_id
          AND i.status NOT IN ('voided','draft')
          AND i.document_type NOT IN ('nota_credito','nota_debito')
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
          AND ii.is_cortesia = false
        GROUP BY COALESCE(ii.product_id, ii.supply_id), ii.description, COALESCE(p.sku, s.sku, '')
    )
    SELECT * FROM ranked
    ORDER BY
        CASE WHEN p_order = 'desc' THEN total_revenue END DESC NULLS LAST,
        CASE WHEN p_order = 'asc' THEN total_revenue END ASC NULLS LAST
    LIMIT p_limit;
$$;

-- 4.4 fn_kpi_operational_leaks: Voided, cortesias, promotions
CREATE OR REPLACE FUNCTION public.fn_kpi_operational_leaks(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    voided_count        bigint,
    voided_amount       numeric,
    voided_pct_tx       numeric,
    voided_pct_revenue  numeric,
    cortesia_count      bigint,
    cortesia_amount     numeric,
    cortesia_pct_tx     numeric,
    cortesia_pct_revenue numeric,
    promo_tx_count      bigint,
    promo_discount_total numeric,
    promo_pct_tx        numeric,
    promo_pct_revenue   numeric,
    total_tx            bigint,
    total_revenue       numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_total_tx bigint;
    v_total_revenue numeric;
    v_voided_count bigint;
    v_voided_amount numeric;
    v_cortesia_count bigint;
    v_cortesia_amount numeric;
    v_promo_tx_count bigint;
    v_promo_discount_total numeric;
BEGIN
    -- Total valid transactions
    SELECT COUNT(*), COALESCE(SUM(i.total), 0)
    INTO v_total_tx, v_total_revenue
    FROM invoices i
    LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
    WHERE i.tenant_id = p_tenant_id
      AND i.status NOT IN ('voided', 'draft')
      AND i.document_type NOT IN ('nota_credito','nota_debito')
      AND i.issue_date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id);

    -- Voided invoices
    SELECT COUNT(*), COALESCE(SUM(i.total), 0)
    INTO v_voided_count, v_voided_amount
    FROM invoices i
    LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
    WHERE i.tenant_id = p_tenant_id
      AND i.status = 'voided'
      AND i.issue_date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id);

    -- Cortesias
    SELECT
        COUNT(DISTINCT i.id),
        COALESCE(SUM(ii.original_unit_price * ii.quantity - ii.total), 0)
    INTO v_cortesia_count, v_cortesia_amount
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
    WHERE i.tenant_id = p_tenant_id
      AND ii.is_cortesia = true
      AND i.status NOT IN ('voided', 'draft')
      AND i.issue_date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id);

    -- Promotions
    SELECT COUNT(*), COALESCE(SUM(i.promotion_discount), 0)
    INTO v_promo_tx_count, v_promo_discount_total
    FROM invoices i
    LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
    WHERE i.tenant_id = p_tenant_id
      AND i.promotion_id IS NOT NULL
      AND i.status NOT IN ('voided', 'draft')
      AND i.issue_date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id);

    -- Safe division
    IF v_total_tx = 0 THEN v_total_tx := 1; END IF;
    IF v_total_revenue = 0 THEN v_total_revenue := 1; END IF;

    RETURN QUERY SELECT
        v_voided_count,
        v_voided_amount,
        ROUND(v_voided_count::numeric / (GREATEST(v_total_tx, 1) + v_voided_count) * 100, 2),
        ROUND(v_voided_amount / (GREATEST(v_total_revenue, 1) + v_voided_amount) * 100, 2),
        v_cortesia_count,
        v_cortesia_amount,
        ROUND(v_cortesia_count::numeric / GREATEST(v_total_tx, 1) * 100, 2),
        ROUND(v_cortesia_amount / GREATEST(v_total_revenue, 1) * 100, 2),
        v_promo_tx_count,
        v_promo_discount_total,
        ROUND(v_promo_tx_count::numeric / GREATEST(v_total_tx, 1) * 100, 2),
        ROUND(v_promo_discount_total / GREATEST(v_total_revenue, 1) * 100, 2),
        v_total_tx,
        v_total_revenue;
END;
$$;

-- 4.5 fn_kpi_inventory_health: Audit discrepancies and losses
CREATE OR REPLACE FUNCTION public.fn_kpi_inventory_health(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    total_audits           bigint,
    items_audited          bigint,
    items_with_discrepancy bigint,
    total_discrepancy_value numeric,
    efficiency_pct         numeric,
    waste_movements        bigint,
    waste_value            numeric,
    shrinkage_movements    bigint,
    shrinkage_value        numeric,
    breakage_movements     bigint,
    breakage_value         numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH audit_data AS (
        SELECT
            COUNT(DISTINCT a.id) AS total_audits,
            COALESCE(SUM(a.items_audited), 0) AS items_audited,
            COALESCE(SUM(a.items_adjusted), 0) AS items_with_discrepancy,
            COALESCE(SUM(ABS(a.total_discrepancy_value)), 0) AS total_discrepancy_value
        FROM public.inventory_audits a
        WHERE a.tenant_id = p_tenant_id
          AND a.status = 'approved'
          AND a.created_at::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
    ),
    movement_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE im.movement_type = 'waste') AS waste_movements,
            COUNT(*) FILTER (WHERE im.movement_type = 'shrinkage') AS shrinkage_movements,
            COUNT(*) FILTER (WHERE im.movement_type = 'breakage') AS breakage_movements
        FROM public.inventory_movements im
        WHERE im.tenant_id = p_tenant_id
          AND im.movement_type IN ('waste','shrinkage','breakage')
          AND im.created_at::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR im.branch_id = p_branch_id)
    ),
    movement_values AS (
        SELECT
            COALESCE(SUM(CASE WHEN im.movement_type = 'waste' THEN
                im.quantity * COALESCE(
                    CASE WHEN im.entity_type = 'product' THEN p.cost_price
                         WHEN im.entity_type = 'supply' THEN s.cost_price END, 0)
            ELSE 0 END), 0) AS waste_value,
            COALESCE(SUM(CASE WHEN im.movement_type = 'shrinkage' THEN
                im.quantity * COALESCE(
                    CASE WHEN im.entity_type = 'product' THEN p.cost_price
                         WHEN im.entity_type = 'supply' THEN s.cost_price END, 0)
            ELSE 0 END), 0) AS shrinkage_value,
            COALESCE(SUM(CASE WHEN im.movement_type = 'breakage' THEN
                im.quantity * COALESCE(
                    CASE WHEN im.entity_type = 'product' THEN p.cost_price
                         WHEN im.entity_type = 'supply' THEN s.cost_price END, 0)
            ELSE 0 END), 0) AS breakage_value
        FROM public.inventory_movements im
        LEFT JOIN public.products p ON im.entity_type = 'product' AND im.entity_id = p.id
        LEFT JOIN public.supplies s ON im.entity_type = 'supply' AND im.entity_id = s.id
        WHERE im.tenant_id = p_tenant_id
          AND im.movement_type IN ('waste','shrinkage','breakage')
          AND im.created_at::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR im.branch_id = p_branch_id)
    )
    SELECT
        ad.total_audits,
        ad.items_audited,
        ad.items_with_discrepancy,
        ad.total_discrepancy_value,
        CASE WHEN ad.items_audited > 0
            THEN ROUND((1 - ad.items_with_discrepancy::numeric / ad.items_audited) * 100, 2)
            ELSE 100
        END AS efficiency_pct,
        mc.waste_movements,
        mv.waste_value,
        mc.shrinkage_movements,
        mv.shrinkage_value,
        mc.breakage_movements,
        mv.breakage_value
    FROM audit_data ad, movement_counts mc, movement_values mv;
$$;

-- 4.6 fn_generate_daily_snapshot: Populate snapshot for a given day
CREATE OR REPLACE FUNCTION public.fn_generate_daily_snapshot(
    p_tenant_id uuid,
    p_date date DEFAULT CURRENT_DATE - 1
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_branch RECORD;
BEGIN
    FOR v_branch IN
        SELECT id, max_capacity FROM branches WHERE tenant_id = p_tenant_id AND is_active = true
    LOOP
        INSERT INTO kpi_daily_snapshots (
            tenant_id, branch_id, snapshot_date,
            total_revenue, transaction_count, avg_ticket,
            revenue_cash, revenue_card, revenue_transfer, revenue_credit, revenue_mixed,
            voided_count, voided_amount, cortesia_count, cortesia_amount,
            promotion_tx_count, promotion_discount_total,
            inventory_shrinkage_value, inventory_waste_value
        )
        SELECT
            p_tenant_id, v_branch.id, p_date,
            COALESCE(SUM(CASE WHEN i.document_type = 'nota_credito' THEN -i.total ELSE i.total END)
                FILTER (WHERE i.status NOT IN ('voided','draft')), 0),
            COUNT(*) FILTER (WHERE i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito')),
            CASE WHEN COUNT(*) FILTER (WHERE i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito')) > 0
                THEN ROUND(COALESCE(SUM(i.total) FILTER (WHERE i.status NOT IN ('voided','draft')
                    AND i.document_type NOT IN ('nota_credito','nota_debito')), 0)
                    / COUNT(*) FILTER (WHERE i.status NOT IN ('voided','draft')
                    AND i.document_type NOT IN ('nota_credito','nota_debito')), 2)
                ELSE 0 END,
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'cash' AND i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'card' AND i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'transfer' AND i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'credit' AND i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method = 'mixed' AND i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COUNT(*) FILTER (WHERE i.status = 'voided'),
            COALESCE(SUM(i.total) FILTER (WHERE i.status = 'voided'), 0),
            COALESCE((SELECT COUNT(DISTINCT ii.invoice_id) FROM invoice_items ii
                JOIN invoices inv ON ii.invoice_id = inv.id
                JOIN cash_registers cr2 ON inv.cash_register_id = cr2.id
                WHERE inv.tenant_id = p_tenant_id AND cr2.branch_id = v_branch.id
                AND ii.is_cortesia = true AND inv.status NOT IN ('voided','draft')
                AND inv.issue_date = p_date), 0),
            COALESCE((SELECT SUM(ii.original_unit_price * ii.quantity - ii.total) FROM invoice_items ii
                JOIN invoices inv ON ii.invoice_id = inv.id
                JOIN cash_registers cr2 ON inv.cash_register_id = cr2.id
                WHERE inv.tenant_id = p_tenant_id AND cr2.branch_id = v_branch.id
                AND ii.is_cortesia = true AND inv.status NOT IN ('voided','draft')
                AND inv.issue_date = p_date), 0),
            COUNT(*) FILTER (WHERE i.promotion_id IS NOT NULL AND i.status NOT IN ('voided','draft')),
            COALESCE(SUM(i.promotion_discount) FILTER (WHERE i.promotion_id IS NOT NULL
                AND i.status NOT IN ('voided','draft')), 0),
            COALESCE((SELECT SUM(im.quantity * COALESCE(p.cost_price, s.cost_price, 0))
                FROM inventory_movements im
                LEFT JOIN products p ON im.entity_type = 'product' AND im.entity_id = p.id
                LEFT JOIN supplies s ON im.entity_type = 'supply' AND im.entity_id = s.id
                WHERE im.tenant_id = p_tenant_id AND im.branch_id = v_branch.id
                AND im.movement_type = 'shrinkage' AND im.created_at::date = p_date), 0),
            COALESCE((SELECT SUM(im.quantity * COALESCE(p.cost_price, s.cost_price, 0))
                FROM inventory_movements im
                LEFT JOIN products p ON im.entity_type = 'product' AND im.entity_id = p.id
                LEFT JOIN supplies s ON im.entity_type = 'supply' AND im.entity_id = s.id
                WHERE im.tenant_id = p_tenant_id AND im.branch_id = v_branch.id
                AND im.movement_type = 'waste' AND im.created_at::date = p_date), 0)
        FROM invoices i
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id
          AND cr.branch_id = v_branch.id
          AND i.issue_date = p_date
        ON CONFLICT (tenant_id, branch_id, snapshot_date)
        DO UPDATE SET
            total_revenue = EXCLUDED.total_revenue,
            transaction_count = EXCLUDED.transaction_count,
            avg_ticket = EXCLUDED.avg_ticket,
            revenue_cash = EXCLUDED.revenue_cash,
            revenue_card = EXCLUDED.revenue_card,
            revenue_transfer = EXCLUDED.revenue_transfer,
            revenue_credit = EXCLUDED.revenue_credit,
            revenue_mixed = EXCLUDED.revenue_mixed,
            voided_count = EXCLUDED.voided_count,
            voided_amount = EXCLUDED.voided_amount,
            cortesia_count = EXCLUDED.cortesia_count,
            cortesia_amount = EXCLUDED.cortesia_amount,
            promotion_tx_count = EXCLUDED.promotion_tx_count,
            promotion_discount_total = EXCLUDED.promotion_discount_total,
            inventory_shrinkage_value = EXCLUDED.inventory_shrinkage_value,
            inventory_waste_value = EXCLUDED.inventory_waste_value,
            computed_at = now();
    END LOOP;

    -- Tenant-wide aggregate (branch_id = NULL)
    INSERT INTO kpi_daily_snapshots (
        tenant_id, branch_id, snapshot_date,
        total_revenue, transaction_count, avg_ticket,
        revenue_cash, revenue_card, revenue_transfer, revenue_credit, revenue_mixed,
        voided_count, voided_amount, cortesia_count, cortesia_amount,
        promotion_tx_count, promotion_discount_total,
        inventory_shrinkage_value, inventory_waste_value
    )
    SELECT
        p_tenant_id, NULL, p_date,
        SUM(total_revenue), SUM(transaction_count),
        CASE WHEN SUM(transaction_count) > 0 THEN ROUND(SUM(total_revenue) / SUM(transaction_count), 2) ELSE 0 END,
        SUM(revenue_cash), SUM(revenue_card), SUM(revenue_transfer), SUM(revenue_credit), SUM(revenue_mixed),
        SUM(voided_count), SUM(voided_amount), SUM(cortesia_count), SUM(cortesia_amount),
        SUM(promotion_tx_count), SUM(promotion_discount_total),
        SUM(inventory_shrinkage_value), SUM(inventory_waste_value)
    FROM kpi_daily_snapshots
    WHERE tenant_id = p_tenant_id AND snapshot_date = p_date AND branch_id IS NOT NULL
    ON CONFLICT (tenant_id, branch_id, snapshot_date)
    DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        transaction_count = EXCLUDED.transaction_count,
        avg_ticket = EXCLUDED.avg_ticket,
        revenue_cash = EXCLUDED.revenue_cash,
        revenue_card = EXCLUDED.revenue_card,
        revenue_transfer = EXCLUDED.revenue_transfer,
        revenue_credit = EXCLUDED.revenue_credit,
        revenue_mixed = EXCLUDED.revenue_mixed,
        voided_count = EXCLUDED.voided_count,
        voided_amount = EXCLUDED.voided_amount,
        cortesia_count = EXCLUDED.cortesia_count,
        cortesia_amount = EXCLUDED.cortesia_amount,
        promotion_tx_count = EXCLUDED.promotion_tx_count,
        promotion_discount_total = EXCLUDED.promotion_discount_total,
        inventory_shrinkage_value = EXCLUDED.inventory_shrinkage_value,
        inventory_waste_value = EXCLUDED.inventory_waste_value,
        computed_at = now();
END;
$$;
