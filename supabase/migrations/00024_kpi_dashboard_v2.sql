-- ============================================================================
-- Migration 00024: KPI Dashboard v2 - Professional Analytics
-- Date: 2026-03-27
-- Description:
--   1. Schema: new columns on kpi_daily_snapshots, new indexes
--   2. New RPCs: fn_kpi_expenses_summary, fn_kpi_expenses_trend, fn_kpi_time_series
--   3. New RPCs: fn_report_kardex_inventario, fn_report_inventario_valorizado_v2
--   4. Modified RPCs: fn_kpi_product_ranking (+cost/margin),
--      fn_kpi_inventory_health (+units/loss%), fn_kpi_hourly_sales (+products_sold)
--   5. Updated fn_generate_daily_snapshot with expenses
-- ============================================================================

-- =============================================================
-- 1. SCHEMA CHANGES
-- =============================================================
ALTER TABLE public.kpi_daily_snapshots
    ADD COLUMN IF NOT EXISTS total_expenses numeric(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS expense_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inv_mov_tenant_entity_date
    ON public.inventory_movements(tenant_id, entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_items_entity_audit
    ON public.inventory_audit_items(entity_type, entity_id, audit_id);

CREATE INDEX IF NOT EXISTS idx_crm_tenant_type_date
    ON public.cash_register_movements(tenant_id, type, created_at)
    WHERE type IN ('cash_out', 'expense');

-- =============================================================
-- 2. fn_kpi_expenses_summary
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_kpi_expenses_summary(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    total_expense_amount numeric,
    expense_count        bigint,
    prev_expense_amount  numeric,
    prev_expense_count   bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_total numeric; v_count bigint;
    v_prev_total numeric; v_prev_count bigint;
    v_prev_from date; v_prev_to date;
BEGIN
    SELECT COALESCE(SUM(m.amount), 0), COUNT(*)
    INTO v_total, v_count
    FROM cash_register_movements m
    LEFT JOIN cash_register_openings cro ON m.opening_id = cro.id
    LEFT JOIN cash_registers cr ON cro.cash_register_id = cr.id
    WHERE m.tenant_id = p_tenant_id
      AND m.type IN ('cash_out', 'expense')
      AND (m.created_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id);

    v_prev_to := p_date_from - 1;
    v_prev_from := v_prev_to - (p_date_to - p_date_from);

    SELECT COALESCE(SUM(m.amount), 0), COUNT(*)
    INTO v_prev_total, v_prev_count
    FROM cash_register_movements m
    LEFT JOIN cash_register_openings cro ON m.opening_id = cro.id
    LEFT JOIN cash_registers cr ON cro.cash_register_id = cr.id
    WHERE m.tenant_id = p_tenant_id
      AND m.type IN ('cash_out', 'expense')
      AND (m.created_at AT TIME ZONE 'America/Lima')::date BETWEEN v_prev_from AND v_prev_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id);

    RETURN QUERY SELECT v_total, v_count, v_prev_total, v_prev_count;
END;
$$;

-- =============================================================
-- 3. fn_kpi_expenses_trend
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_kpi_expenses_trend(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    expense_date   date,
    total_amount   numeric,
    movement_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT
        (m.created_at AT TIME ZONE 'America/Lima')::date,
        COALESCE(SUM(m.amount), 0),
        COUNT(*)
    FROM cash_register_movements m
    LEFT JOIN cash_register_openings cro ON m.opening_id = cro.id
    LEFT JOIN cash_registers cr ON cro.cash_register_id = cr.id
    WHERE m.tenant_id = p_tenant_id
      AND m.type IN ('cash_out', 'expense')
      AND (m.created_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    GROUP BY 1 ORDER BY 1;
$$;

-- =============================================================
-- 4. fn_kpi_time_series (unified granularity)
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_kpi_time_series(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE,
    p_granularity text DEFAULT 'daily'
) RETURNS TABLE (
    time_bucket   text,
    revenue       numeric,
    tx_count      bigint,
    avg_ticket    numeric,
    products_sold numeric,
    entries_sold  bigint,
    qr_entries    bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    WITH invoice_data AS (
        SELECT
            CASE p_granularity
                WHEN 'hourly'  THEN LPAD(EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')::text, 2, '0') || ':00'
                WHEN 'daily'   THEN TO_CHAR(i.issue_date, 'YYYY-MM-DD')
                WHEN 'monthly' THEN TO_CHAR(i.issue_date, 'YYYY-MM')
            END AS bucket,
            i.total, i.id AS invoice_id
        FROM invoices i
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id
          AND i.status NOT IN ('voided', 'draft')
          AND i.document_type NOT IN ('nota_credito', 'nota_debito')
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    ),
    sales_agg AS (
        SELECT bucket,
            COALESCE(SUM(total), 0) AS rev,
            COUNT(*) AS txc,
            CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(total)/COUNT(*), 2) ELSE 0 END AS avgt
        FROM invoice_data GROUP BY bucket
    ),
    products_agg AS (
        SELECT id.bucket, COALESCE(SUM(ii.quantity), 0) AS ps
        FROM invoice_data id
        JOIN invoice_items ii ON ii.invoice_id = id.invoice_id
        WHERE ii.is_cortesia = false
        GROUP BY id.bucket
    ),
    entries_sold_agg AS (
        SELECT
            CASE p_granularity
                WHEN 'hourly'  THEN LPAD(EXTRACT(HOUR FROM r.slot_start)::text, 2, '0') || ':00'
                WHEN 'daily'   THEN TO_CHAR(r.reservation_date, 'YYYY-MM-DD')
                WHEN 'monthly' THEN TO_CHAR(r.reservation_date, 'YYYY-MM')
            END AS bucket,
            SUM(r.quantity)::bigint AS es
        FROM reservations r
        WHERE r.tenant_id = p_tenant_id
          AND r.reservation_date BETWEEN p_date_from AND p_date_to
          AND r.status NOT IN ('cancelled')
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
        GROUP BY 1
    ),
    qr_agg AS (
        SELECT
            CASE p_granularity
                WHEN 'hourly'  THEN LPAD(EXTRACT(HOUR FROM re.scanned_at AT TIME ZONE 'America/Lima')::text, 2, '0') || ':00'
                WHEN 'daily'   THEN TO_CHAR((re.scanned_at AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD')
                WHEN 'monthly' THEN TO_CHAR((re.scanned_at AT TIME ZONE 'America/Lima')::date, 'YYYY-MM')
            END AS bucket,
            SUM(re.entries_count)::bigint AS qr
        FROM reservation_entries re
        JOIN reservations r ON re.reservation_id = r.id
        WHERE re.tenant_id = p_tenant_id
          AND (re.scanned_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
        GROUP BY 1
    ),
    all_buckets AS (
        SELECT bucket FROM sales_agg UNION
        SELECT bucket FROM entries_sold_agg UNION
        SELECT bucket FROM qr_agg
    )
    SELECT ab.bucket,
        COALESCE(sa.rev, 0), COALESCE(sa.txc, 0)::bigint, COALESCE(sa.avgt, 0),
        COALESCE(pa.ps, 0), COALESCE(esa.es, 0)::bigint, COALESCE(qa.qr, 0)::bigint
    FROM all_buckets ab
    LEFT JOIN sales_agg sa ON ab.bucket = sa.bucket
    LEFT JOIN products_agg pa ON ab.bucket = pa.bucket
    LEFT JOIN entries_sold_agg esa ON ab.bucket = esa.bucket
    LEFT JOIN qr_agg qa ON ab.bucket = qa.bucket
    ORDER BY ab.bucket;
END;
$$;

-- =============================================================
-- 5. fn_kpi_product_ranking (DROP + recreate with cost/margin)
-- =============================================================
DROP FUNCTION IF EXISTS public.fn_kpi_product_ranking(uuid, uuid, date, date, integer, text);

CREATE OR REPLACE FUNCTION public.fn_kpi_product_ranking(
    p_tenant_id uuid, p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
    p_date_to date DEFAULT CURRENT_DATE,
    p_limit integer DEFAULT 10, p_order text DEFAULT 'desc'
) RETURNS TABLE (
    product_id uuid, product_name text, product_sku text,
    units_sold numeric, total_revenue numeric, pct_of_total numeric,
    avg_unit_price numeric, cost_price numeric, margin numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH period_total AS (
        SELECT COALESCE(SUM(ii.total), 0) AS grand_total
        FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id AND i.status NOT IN ('voided','draft')
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
            CASE WHEN (SELECT grand_total FROM period_total) > 0
                THEN ROUND(SUM(ii.total) / (SELECT grand_total FROM period_total) * 100, 2) ELSE 0 END AS pct_of_total,
            CASE WHEN SUM(ii.quantity) > 0
                THEN ROUND(SUM(ii.total) / SUM(ii.quantity), 2) ELSE 0 END AS avg_unit_price,
            ROUND(COALESCE(SUM(ii.quantity * COALESCE(ii.cost_price, 0)) / NULLIF(SUM(ii.quantity), 0), 0), 2) AS cost_price,
            SUM(ii.total) - SUM(ii.quantity * COALESCE(ii.cost_price, 0)) AS margin
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        LEFT JOIN products p ON ii.product_id = p.id
        LEFT JOIN supplies s ON ii.supply_id = s.id
        WHERE i.tenant_id = p_tenant_id AND i.status NOT IN ('voided','draft')
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

-- =============================================================
-- 6. fn_kpi_inventory_health (DROP + recreate with units/loss%)
-- =============================================================
DROP FUNCTION IF EXISTS public.fn_kpi_inventory_health(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_kpi_inventory_health(
    p_tenant_id uuid, p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    total_audits bigint, items_audited bigint, items_with_discrepancy bigint,
    total_discrepancy_value numeric, efficiency_pct numeric,
    waste_movements bigint, waste_value numeric, waste_units numeric,
    shrinkage_movements bigint, shrinkage_value numeric, shrinkage_units numeric,
    breakage_movements bigint, breakage_value numeric, breakage_units numeric,
    staff_consumption_movements bigint, staff_consumption_value numeric, staff_consumption_units numeric,
    total_loss_value numeric, loss_pct_of_sales numeric, loss_pct_of_transactions numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH audit_data AS (
        SELECT
            COUNT(DISTINCT a.id) AS total_audits,
            COALESCE(SUM(a.items_audited), 0) AS items_audited,
            COALESCE(SUM(a.items_adjusted), 0) AS items_with_discrepancy,
            COALESCE(SUM(ABS(a.total_discrepancy_value)), 0) AS total_discrepancy_value
        FROM inventory_audits a
        WHERE a.tenant_id = p_tenant_id AND a.status = 'approved'
          AND a.created_at::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
    ),
    movement_data AS (
        SELECT
            COUNT(*) FILTER (WHERE im.movement_type = 'waste') AS wm,
            COUNT(*) FILTER (WHERE im.movement_type = 'shrinkage') AS sm,
            COUNT(*) FILTER (WHERE im.movement_type = 'breakage') AS bm,
            COUNT(*) FILTER (WHERE im.movement_type = 'staff_consumption') AS scm,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'waste'), 0) AS wu,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'shrinkage'), 0) AS su,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'breakage'), 0) AS bu,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'staff_consumption'), 0) AS scu,
            COALESCE(SUM(CASE WHEN im.movement_type = 'waste' THEN im.quantity * COALESCE(
                CASE WHEN im.entity_type='product' THEN p.cost_price ELSE s.cost_price END, 0)
            ELSE 0 END), 0) AS wv,
            COALESCE(SUM(CASE WHEN im.movement_type = 'shrinkage' THEN im.quantity * COALESCE(
                CASE WHEN im.entity_type='product' THEN p.cost_price ELSE s.cost_price END, 0)
            ELSE 0 END), 0) AS sv,
            COALESCE(SUM(CASE WHEN im.movement_type = 'breakage' THEN im.quantity * COALESCE(
                CASE WHEN im.entity_type='product' THEN p.cost_price ELSE s.cost_price END, 0)
            ELSE 0 END), 0) AS bv,
            COALESCE(SUM(CASE WHEN im.movement_type = 'staff_consumption' THEN im.quantity * COALESCE(
                CASE WHEN im.entity_type='product' THEN p.cost_price ELSE s.cost_price END, 0)
            ELSE 0 END), 0) AS scv
        FROM inventory_movements im
        LEFT JOIN products p ON im.entity_type = 'product' AND im.entity_id = p.id
        LEFT JOIN supplies s ON im.entity_type = 'supply' AND im.entity_id = s.id
        WHERE im.tenant_id = p_tenant_id
          AND im.movement_type IN ('waste','shrinkage','breakage','staff_consumption')
          AND im.created_at::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR im.branch_id = p_branch_id)
    ),
    sales_ref AS (
        SELECT COALESCE(SUM(i.total), 0) AS rev, COUNT(*) AS txc
        FROM invoices i LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id AND i.status NOT IN ('voided','draft')
          AND i.document_type NOT IN ('nota_credito','nota_debito')
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    )
    SELECT
        ad.total_audits, ad.items_audited, ad.items_with_discrepancy, ad.total_discrepancy_value,
        CASE WHEN ad.items_audited > 0
            THEN ROUND((1 - ad.items_with_discrepancy::numeric / ad.items_audited) * 100, 2) ELSE 100 END,
        md.wm, md.wv, md.wu,
        md.sm, md.sv, md.su,
        md.bm, md.bv, md.bu,
        md.scm, md.scv, md.scu,
        md.wv + md.sv + md.bv + md.scv,
        CASE WHEN sr.rev > 0 THEN ROUND((md.wv + md.sv + md.bv + md.scv) / sr.rev * 100, 2) ELSE 0 END,
        CASE WHEN sr.txc > 0 THEN ROUND((md.wm + md.sm + md.bm + md.scm)::numeric / sr.txc * 100, 2) ELSE 0 END
    FROM audit_data ad, movement_data md, sales_ref sr;
$$;

-- =============================================================
-- 7. fn_kpi_hourly_sales (DROP + recreate with products_sold)
-- =============================================================
DROP FUNCTION IF EXISTS public.fn_kpi_hourly_sales(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_kpi_hourly_sales(
    p_tenant_id uuid, p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE, p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    hour_of_day   integer,
    revenue       numeric,
    tx_count      bigint,
    products_sold numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH daily_hours AS (
        SELECT
            EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')::integer AS hod,
            i.total, i.id AS iid, i.issue_date
        FROM invoices i
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id
          AND i.status NOT IN ('voided', 'draft')
          AND i.document_type NOT IN ('nota_credito', 'nota_debito')
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    ),
    num_days AS (
        SELECT GREATEST(COUNT(DISTINCT issue_date), 1)::numeric AS d FROM daily_hours
    ),
    hourly_sales AS (
        SELECT hod,
            CASE WHEN (SELECT d FROM num_days) = 1 THEN COALESCE(SUM(total), 0)
                 ELSE ROUND(COALESCE(SUM(total), 0) / (SELECT d FROM num_days), 2) END AS revenue,
            CASE WHEN (SELECT d FROM num_days) = 1 THEN COUNT(*)
                 ELSE ROUND(COUNT(*)::numeric / (SELECT d FROM num_days))::bigint END AS tx_count
        FROM daily_hours GROUP BY hod
    ),
    hourly_products AS (
        SELECT dh.hod,
            CASE WHEN (SELECT d FROM num_days) = 1 THEN COALESCE(SUM(ii.quantity), 0)
                 ELSE ROUND(COALESCE(SUM(ii.quantity), 0) / (SELECT d FROM num_days), 2) END AS ps
        FROM daily_hours dh
        JOIN invoice_items ii ON ii.invoice_id = dh.iid
        WHERE ii.is_cortesia = false
        GROUP BY dh.hod
    )
    SELECT hs.hod, hs.revenue, hs.tx_count, COALESCE(hp.ps, 0)
    FROM hourly_sales hs
    LEFT JOIN hourly_products hp ON hs.hod = hp.hod
    ORDER BY hs.hod;
$$;

-- =============================================================
-- 8. fn_report_kardex_inventario (NEW - the key manager report)
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_report_kardex_inventario(
    p_tenant_id uuid,
    p_date_from date,
    p_date_to date,
    p_branch_id uuid DEFAULT NULL,
    p_entity_type text DEFAULT NULL
) RETURNS TABLE (
    tipo text, sku text, nombre text, categoria text,
    qty_venta numeric, qty_cortesia numeric, qty_merma numeric,
    qty_perdida numeric, qty_rotura numeric, qty_consumo_staff numeric,
    qty_ajuste numeric, qty_transferencia numeric, qty_nc_retorno numeric,
    qty_ingreso numeric, qty_salida numeric, total_movimientos numeric,
    stock_teorico numeric, stock_fisico numeric, diferencia numeric,
    fecha_ultimo_conteo text, costo_unitario numeric, valor_stock numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH entities AS (
        -- Products
        SELECT 'Producto'::text AS tipo, p.id, p.sku, p.name AS nombre,
            COALESCE(pc.name, 'Sin categoria') AS categoria,
            p.stock_quantity, p.cost_price, 'product'::text AS entity_type
        FROM products p
        LEFT JOIN product_category_assignments pca ON pca.product_id = p.id
        LEFT JOIN product_categories pc ON pc.id = pca.category_id
        WHERE p.tenant_id = p_tenant_id AND p.is_active = true
          AND p.type = 'product'
          AND (p_entity_type IS NULL OR p_entity_type = 'product')

        UNION ALL

        -- Supplies
        SELECT 'Insumo'::text, s.id, s.sku, s.name,
            COALESCE(pc.name, 'Sin categoria'),
            s.stock_quantity, s.cost_price, 'supply'::text
        FROM supplies s
        LEFT JOIN supply_category_assignments sca ON sca.supply_id = s.id
        LEFT JOIN product_categories pc ON pc.id = sca.category_id
        WHERE s.tenant_id = p_tenant_id AND s.is_active = true
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND (p_entity_type IS NULL OR p_entity_type = 'supply')
    ),
    mov AS (
        SELECT
            im.entity_type, im.entity_id,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'sale'), 0) AS q_sale,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'cortesia'), 0) AS q_cortesia,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'waste'), 0) AS q_waste,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'shrinkage'), 0) AS q_shrinkage,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'breakage'), 0) AS q_breakage,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'staff_consumption'), 0) AS q_staff,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'adjustment'), 0) AS q_adjustment,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'transfer'), 0) AS q_transfer,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'nc_return'), 0) AS q_nc_return,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'income'), 0) AS q_income,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'outcome'), 0) AS q_outcome
        FROM inventory_movements im
        WHERE im.tenant_id = p_tenant_id
          AND im.created_at::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR im.branch_id = p_branch_id)
        GROUP BY im.entity_type, im.entity_id
    ),
    last_audit AS (
        SELECT DISTINCT ON (ai.entity_type, ai.entity_id)
            ai.entity_type, ai.entity_id,
            ai.physical_stock,
            TO_CHAR(a.created_at AT TIME ZONE 'America/Lima', 'DD/MM/YYYY') AS audit_date
        FROM inventory_audit_items ai
        JOIN inventory_audits a ON ai.audit_id = a.id
        WHERE a.tenant_id = p_tenant_id AND a.status = 'approved'
        ORDER BY ai.entity_type, ai.entity_id, a.created_at DESC
    )
    SELECT
        e.tipo, e.sku, e.nombre, e.categoria,
        COALESCE(m.q_sale, 0),
        COALESCE(m.q_cortesia, 0),
        COALESCE(m.q_waste, 0),
        COALESCE(m.q_shrinkage, 0),
        COALESCE(m.q_breakage, 0),
        COALESCE(m.q_staff, 0),
        COALESCE(m.q_adjustment, 0),
        COALESCE(m.q_transfer, 0),
        COALESCE(m.q_nc_return, 0),
        COALESCE(m.q_income, 0),
        COALESCE(m.q_outcome, 0),
        -- total_movimientos: ingresos - egresos
        COALESCE(m.q_income + m.q_nc_return + m.q_adjustment, 0)
        - COALESCE(m.q_sale + m.q_cortesia + m.q_waste + m.q_shrinkage + m.q_breakage + m.q_staff + m.q_transfer + m.q_outcome, 0),
        e.stock_quantity,                        -- stock_teorico
        COALESCE(la.physical_stock, -1),         -- stock_fisico (-1 = sin conteo)
        CASE WHEN la.physical_stock IS NOT NULL
            THEN e.stock_quantity - la.physical_stock
            ELSE 0 END,                          -- diferencia
        COALESCE(la.audit_date, 'Sin conteo'),
        e.cost_price,
        e.stock_quantity * e.cost_price           -- valor_stock
    FROM entities e
    LEFT JOIN mov m ON m.entity_type = e.entity_type AND m.entity_id = e.id
    LEFT JOIN last_audit la ON la.entity_type = e.entity_type AND la.entity_id = e.id
    ORDER BY e.tipo, e.nombre;
$$;

-- =============================================================
-- 9. fn_report_inventario_valorizado_v2 (enhanced with movements + audit)
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_report_inventario_valorizado_v2(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT NULL,
    p_date_to date DEFAULT NULL
) RETURNS TABLE (
    tipo text, sku text, nombre text, categoria text,
    stock_actual numeric, stock_minimo numeric, costo_unitario numeric,
    valor_total numeric, estado_stock text,
    total_ingresos numeric, total_salidas numeric, cambio_neto numeric,
    fecha_ultimo_conteo text, stock_ultimo_conteo numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH entities AS (
        SELECT 'Producto'::text AS tipo, p.id, p.sku, p.name,
            COALESCE(pc.name, 'Sin categoria') AS cat,
            p.stock_quantity, COALESCE(p.min_stock, 0) AS min_stock,
            p.cost_price, 'product'::text AS et
        FROM products p
        LEFT JOIN product_category_assignments pca ON pca.product_id = p.id
        LEFT JOIN product_categories pc ON pc.id = pca.category_id
        WHERE p.tenant_id = p_tenant_id AND p.is_active = true AND p.type = 'product'
        UNION ALL
        SELECT 'Insumo'::text, s.id, s.sku, s.name,
            COALESCE(pc.name, 'Sin categoria'),
            s.stock_quantity, COALESCE(s.min_stock, 0),
            s.cost_price, 'supply'::text
        FROM supplies s
        LEFT JOIN supply_category_assignments sca ON sca.supply_id = s.id
        LEFT JOIN product_categories pc ON pc.id = sca.category_id
        WHERE s.tenant_id = p_tenant_id AND s.is_active = true
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    ),
    mov_summary AS (
        SELECT im.entity_type, im.entity_id,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type IN ('income','nc_return')), 0) AS total_in,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type IN ('sale','cortesia','waste','shrinkage','breakage','staff_consumption','outcome','transfer')), 0) AS total_out
        FROM inventory_movements im
        WHERE im.tenant_id = p_tenant_id
          AND (p_date_from IS NULL OR im.created_at::date >= p_date_from)
          AND (p_date_to IS NULL OR im.created_at::date <= p_date_to)
          AND (p_branch_id IS NULL OR im.branch_id = p_branch_id)
        GROUP BY im.entity_type, im.entity_id
    ),
    last_audit AS (
        SELECT DISTINCT ON (ai.entity_type, ai.entity_id)
            ai.entity_type, ai.entity_id, ai.physical_stock,
            TO_CHAR(a.created_at AT TIME ZONE 'America/Lima', 'DD/MM/YYYY') AS audit_date
        FROM inventory_audit_items ai
        JOIN inventory_audits a ON ai.audit_id = a.id
        WHERE a.tenant_id = p_tenant_id AND a.status = 'approved'
        ORDER BY ai.entity_type, ai.entity_id, a.created_at DESC
    )
    SELECT e.tipo, e.sku, e.name, e.cat,
        e.stock_quantity, e.min_stock, e.cost_price,
        e.stock_quantity * e.cost_price,
        CASE WHEN e.stock_quantity <= 0 THEN 'Agotado'
             WHEN e.stock_quantity <= e.min_stock THEN 'Bajo'
             ELSE 'Normal' END,
        COALESCE(ms.total_in, 0),
        COALESCE(ms.total_out, 0),
        COALESCE(ms.total_in, 0) - COALESCE(ms.total_out, 0),
        COALESCE(la.audit_date, 'Sin conteo'),
        COALESCE(la.physical_stock, -1)
    FROM entities e
    LEFT JOIN mov_summary ms ON ms.entity_type = e.et AND ms.entity_id = e.id
    LEFT JOIN last_audit la ON la.entity_type = e.et AND la.entity_id = e.id
    ORDER BY e.tipo, e.name;
$$;

-- =============================================================
-- 10. Updated fn_generate_daily_snapshot (+ expenses)
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_generate_daily_snapshot(
    p_tenant_id uuid,
    p_date date DEFAULT CURRENT_DATE - 1
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_branch RECORD;
BEGIN
    FOR v_branch IN
        SELECT id FROM branches WHERE tenant_id = p_tenant_id AND is_active = true
    LOOP
        INSERT INTO kpi_daily_snapshots (
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
            p_tenant_id, v_branch.id, p_date,
            -- Revenue
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
            -- Payment methods
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method='cash' AND i.status NOT IN ('voided','draft') AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method='card' AND i.status NOT IN ('voided','draft') AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method='transfer' AND i.status NOT IN ('voided','draft') AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method='credit' AND i.status NOT IN ('voided','draft') AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            COALESCE(SUM(i.total) FILTER (WHERE i.payment_method='mixed' AND i.status NOT IN ('voided','draft') AND i.document_type NOT IN ('nota_credito','nota_debito')), 0),
            -- Voided
            COUNT(*) FILTER (WHERE i.status = 'voided' OR i.document_type = 'nota_credito'),
            COALESCE(SUM(i.total) FILTER (WHERE i.status = 'voided' OR i.document_type = 'nota_credito'), 0),
            -- Cortesia
            COALESCE((SELECT COUNT(DISTINCT ii.invoice_id) FROM invoice_items ii
                JOIN invoices inv ON ii.invoice_id = inv.id JOIN cash_registers cr2 ON inv.cash_register_id = cr2.id
                WHERE inv.tenant_id = p_tenant_id AND cr2.branch_id = v_branch.id
                AND ii.is_cortesia = true AND inv.status NOT IN ('voided','draft') AND inv.issue_date = p_date), 0),
            COALESCE((SELECT SUM(ii.original_unit_price * ii.quantity - ii.total) FROM invoice_items ii
                JOIN invoices inv ON ii.invoice_id = inv.id JOIN cash_registers cr2 ON inv.cash_register_id = cr2.id
                WHERE inv.tenant_id = p_tenant_id AND cr2.branch_id = v_branch.id
                AND ii.is_cortesia = true AND inv.status NOT IN ('voided','draft') AND inv.issue_date = p_date), 0),
            -- Promos
            COUNT(*) FILTER (WHERE i.promotion_id IS NOT NULL AND i.status NOT IN ('voided','draft')),
            COALESCE(SUM(i.promotion_discount) FILTER (WHERE i.promotion_id IS NOT NULL AND i.status NOT IN ('voided','draft')), 0),
            -- Inventory
            COALESCE((SELECT SUM(im.quantity * COALESCE(p.cost_price, s.cost_price, 0))
                FROM inventory_movements im LEFT JOIN products p ON im.entity_type='product' AND im.entity_id=p.id
                LEFT JOIN supplies s ON im.entity_type='supply' AND im.entity_id=s.id
                WHERE im.tenant_id = p_tenant_id AND im.branch_id = v_branch.id
                AND im.movement_type = 'shrinkage' AND im.created_at::date = p_date), 0),
            COALESCE((SELECT SUM(im.quantity * COALESCE(p.cost_price, s.cost_price, 0))
                FROM inventory_movements im LEFT JOIN products p ON im.entity_type='product' AND im.entity_id=p.id
                LEFT JOIN supplies s ON im.entity_type='supply' AND im.entity_id=s.id
                WHERE im.tenant_id = p_tenant_id AND im.branch_id = v_branch.id
                AND im.movement_type = 'waste' AND im.created_at::date = p_date), 0),
            -- Attendance
            COALESCE((SELECT SUM(re.entries_count) FROM reservation_entries re
                JOIN reservations r ON re.reservation_id = r.id
                WHERE re.tenant_id = p_tenant_id AND r.branch_id = v_branch.id
                AND (re.scanned_at AT TIME ZONE 'America/Lima')::date = p_date), 0)::integer,
            COALESCE((SELECT COUNT(*) FROM reservation_entries re
                JOIN reservations r ON re.reservation_id = r.id
                WHERE re.tenant_id = p_tenant_id AND r.branch_id = v_branch.id
                AND (re.scanned_at AT TIME ZONE 'America/Lima')::date = p_date), 0)::integer,
            COALESCE((SELECT SUM(r.quantity) FROM reservations r
                WHERE r.tenant_id = p_tenant_id AND r.branch_id = v_branch.id
                AND r.reservation_date = p_date AND r.status NOT IN ('cancelled')), 0)::integer,
            -- Expenses (NEW)
            COALESCE((SELECT SUM(m.amount) FROM cash_register_movements m
                JOIN cash_register_openings cro ON m.opening_id = cro.id
                JOIN cash_registers cr2 ON cro.cash_register_id = cr2.id
                WHERE m.tenant_id = p_tenant_id AND cr2.branch_id = v_branch.id
                AND m.type IN ('cash_out','expense')
                AND (m.created_at AT TIME ZONE 'America/Lima')::date = p_date), 0),
            COALESCE((SELECT COUNT(*) FROM cash_register_movements m
                JOIN cash_register_openings cro ON m.opening_id = cro.id
                JOIN cash_registers cr2 ON cro.cash_register_id = cr2.id
                WHERE m.tenant_id = p_tenant_id AND cr2.branch_id = v_branch.id
                AND m.type IN ('cash_out','expense')
                AND (m.created_at AT TIME ZONE 'America/Lima')::date = p_date), 0)::integer
        FROM invoices i
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id AND cr.branch_id = v_branch.id AND i.issue_date = p_date
        ON CONFLICT (tenant_id, branch_id, snapshot_date)
        DO UPDATE SET
            total_revenue = EXCLUDED.total_revenue, transaction_count = EXCLUDED.transaction_count,
            avg_ticket = EXCLUDED.avg_ticket,
            revenue_cash = EXCLUDED.revenue_cash, revenue_card = EXCLUDED.revenue_card,
            revenue_transfer = EXCLUDED.revenue_transfer, revenue_credit = EXCLUDED.revenue_credit,
            revenue_mixed = EXCLUDED.revenue_mixed,
            voided_count = EXCLUDED.voided_count, voided_amount = EXCLUDED.voided_amount,
            cortesia_count = EXCLUDED.cortesia_count, cortesia_amount = EXCLUDED.cortesia_amount,
            promotion_tx_count = EXCLUDED.promotion_tx_count, promotion_discount_total = EXCLUDED.promotion_discount_total,
            inventory_shrinkage_value = EXCLUDED.inventory_shrinkage_value,
            inventory_waste_value = EXCLUDED.inventory_waste_value,
            attendance_entries = EXCLUDED.attendance_entries, attendance_scans = EXCLUDED.attendance_scans,
            attendance_entries_sold = EXCLUDED.attendance_entries_sold,
            total_expenses = EXCLUDED.total_expenses, expense_count = EXCLUDED.expense_count,
            computed_at = now();
    END LOOP;

    -- Tenant-wide aggregate (branch_id = NULL)
    INSERT INTO kpi_daily_snapshots (
        tenant_id, branch_id, snapshot_date,
        total_revenue, transaction_count, avg_ticket,
        revenue_cash, revenue_card, revenue_transfer, revenue_credit, revenue_mixed,
        voided_count, voided_amount, cortesia_count, cortesia_amount,
        promotion_tx_count, promotion_discount_total,
        inventory_shrinkage_value, inventory_waste_value,
        attendance_entries, attendance_scans, attendance_entries_sold,
        total_expenses, expense_count
    )
    SELECT p_tenant_id, NULL, p_date,
        SUM(total_revenue), SUM(transaction_count),
        CASE WHEN SUM(transaction_count) > 0 THEN ROUND(SUM(total_revenue)/SUM(transaction_count), 2) ELSE 0 END,
        SUM(revenue_cash), SUM(revenue_card), SUM(revenue_transfer), SUM(revenue_credit), SUM(revenue_mixed),
        SUM(voided_count), SUM(voided_amount), SUM(cortesia_count), SUM(cortesia_amount),
        SUM(promotion_tx_count), SUM(promotion_discount_total),
        SUM(inventory_shrinkage_value), SUM(inventory_waste_value),
        SUM(attendance_entries), SUM(attendance_scans), SUM(attendance_entries_sold),
        SUM(total_expenses), SUM(expense_count)
    FROM kpi_daily_snapshots
    WHERE tenant_id = p_tenant_id AND snapshot_date = p_date AND branch_id IS NOT NULL
    ON CONFLICT (tenant_id, branch_id, snapshot_date)
    DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue, transaction_count = EXCLUDED.transaction_count,
        avg_ticket = EXCLUDED.avg_ticket,
        revenue_cash = EXCLUDED.revenue_cash, revenue_card = EXCLUDED.revenue_card,
        revenue_transfer = EXCLUDED.revenue_transfer, revenue_credit = EXCLUDED.revenue_credit,
        revenue_mixed = EXCLUDED.revenue_mixed,
        voided_count = EXCLUDED.voided_count, voided_amount = EXCLUDED.voided_amount,
        cortesia_count = EXCLUDED.cortesia_count, cortesia_amount = EXCLUDED.cortesia_amount,
        promotion_tx_count = EXCLUDED.promotion_tx_count, promotion_discount_total = EXCLUDED.promotion_discount_total,
        inventory_shrinkage_value = EXCLUDED.inventory_shrinkage_value,
        inventory_waste_value = EXCLUDED.inventory_waste_value,
        attendance_entries = EXCLUDED.attendance_entries, attendance_scans = EXCLUDED.attendance_scans,
        attendance_entries_sold = EXCLUDED.attendance_entries_sold,
        total_expenses = EXCLUDED.total_expenses, expense_count = EXCLUDED.expense_count,
        computed_at = now();
END;
$$;
