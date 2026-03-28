-- 00021_stock_output_movement_type.sql
-- Add 'cortesia' movement type for POS stock outputs (non-sale inventory movements)
-- Fix KPIs: exclude invoices with total = 0 from transaction_count and avg_ticket

-- =============================================================
-- 1. Add 'cortesia' to inventory_movements movement_type CHECK
-- =============================================================
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN (
    'waste','shrinkage','staff_consumption','breakage',
    'adjustment','transfer','income','outcome',
    'sale','nc_return','cortesia'
  ));

-- =============================================================
-- 2. Fix fn_kpi_sales_summary: exclude $0 invoices from count/avg
-- =============================================================
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
        COUNT(*) FILTER (WHERE i.document_type NOT IN ('nota_credito','nota_debito') AND i.total > 0) AS transaction_count,
        CASE
            WHEN COUNT(*) FILTER (WHERE i.document_type NOT IN ('nota_credito','nota_debito') AND i.total > 0) > 0
            THEN ROUND(
                COALESCE(SUM(CASE WHEN i.document_type NOT IN ('nota_credito','nota_debito') AND i.total > 0 THEN i.total ELSE 0 END), 0)
                / COUNT(*) FILTER (WHERE i.document_type NOT IN ('nota_credito','nota_debito') AND i.total > 0),
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

-- =============================================================
-- 3. Fix fn_generate_daily_snapshot: exclude $0 from count/avg
-- =============================================================
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
            inventory_shrinkage_value, inventory_waste_value,
            attendance_entries, attendance_scans, attendance_entries_sold
        )
        SELECT
            p_tenant_id, v_branch.id, p_date,
            COALESCE(SUM(CASE WHEN i.document_type = 'nota_credito' THEN -i.total ELSE i.total END)
                FILTER (WHERE i.status NOT IN ('voided','draft')), 0),
            COUNT(*) FILTER (WHERE i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito') AND i.total > 0),
            CASE WHEN COUNT(*) FILTER (WHERE i.status NOT IN ('voided','draft')
                AND i.document_type NOT IN ('nota_credito','nota_debito') AND i.total > 0) > 0
                THEN ROUND(COALESCE(SUM(i.total) FILTER (WHERE i.status NOT IN ('voided','draft')
                    AND i.document_type NOT IN ('nota_credito','nota_debito') AND i.total > 0), 0)
                    / COUNT(*) FILTER (WHERE i.status NOT IN ('voided','draft')
                    AND i.document_type NOT IN ('nota_credito','nota_debito') AND i.total > 0), 2)
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
            COUNT(*) FILTER (WHERE i.status = 'voided' OR i.document_type = 'nota_credito'),
            COALESCE(SUM(i.total) FILTER (WHERE i.status = 'voided' OR i.document_type = 'nota_credito'), 0),
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
                AND im.movement_type = 'waste' AND im.created_at::date = p_date), 0),
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
                AND r.reservation_date = p_date AND r.status NOT IN ('cancelled')), 0)::integer
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
            attendance_entries = EXCLUDED.attendance_entries,
            attendance_scans = EXCLUDED.attendance_scans,
            attendance_entries_sold = EXCLUDED.attendance_entries_sold,
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
        attendance_entries, attendance_scans, attendance_entries_sold
    )
    SELECT
        p_tenant_id, NULL, p_date,
        SUM(total_revenue), SUM(transaction_count),
        CASE WHEN SUM(transaction_count) > 0 THEN ROUND(SUM(total_revenue) / SUM(transaction_count), 2) ELSE 0 END,
        SUM(revenue_cash), SUM(revenue_card), SUM(revenue_transfer), SUM(revenue_credit), SUM(revenue_mixed),
        SUM(voided_count), SUM(voided_amount), SUM(cortesia_count), SUM(cortesia_amount),
        SUM(promotion_tx_count), SUM(promotion_discount_total),
        SUM(inventory_shrinkage_value), SUM(inventory_waste_value),
        SUM(attendance_entries), SUM(attendance_scans), SUM(attendance_entries_sold)
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
        attendance_entries = EXCLUDED.attendance_entries,
        attendance_scans = EXCLUDED.attendance_scans,
        attendance_entries_sold = EXCLUDED.attendance_entries_sold,
        computed_at = now();
END;
$$;
