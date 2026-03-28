-- ============================================================================
-- Migration 00020: KPI — Entradas Vendidas vs Asistencia
-- Date: 2026-03-23
-- Description:
--   1. Add attendance_entries_sold to kpi_daily_snapshots
--   2. Extend fn_kpi_attendance with entries_sold, prev_entries_sold, no_show_rate
--   3. Extend fn_kpi_hourly_attendance with entries_sold per hour
--   4. Update fn_generate_daily_snapshot to include attendance_entries_sold
-- ============================================================================

-- =============================================================
-- 1. Add attendance_entries_sold column to kpi_daily_snapshots
-- =============================================================
ALTER TABLE public.kpi_daily_snapshots
    ADD COLUMN IF NOT EXISTS attendance_entries_sold integer NOT NULL DEFAULT 0;

-- =============================================================
-- 2. Extend fn_kpi_attendance — add entries_sold, prev_entries_sold, no_show_rate
-- =============================================================
-- Must DROP because return type changes (adding columns)
DROP FUNCTION IF EXISTS public.fn_kpi_attendance(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_kpi_attendance(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    total_entries        bigint,
    total_scans          bigint,
    unique_reservations  bigint,
    active_sessions      bigint,
    avg_dwell_minutes    numeric,
    prev_total_entries   bigint,
    entries_sold         bigint,
    prev_entries_sold    bigint,
    no_show_rate         numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_total_entries bigint;
    v_total_scans bigint;
    v_unique_reservations bigint;
    v_active_sessions bigint;
    v_avg_dwell numeric;
    v_prev_entries bigint;
    v_entries_sold bigint;
    v_prev_entries_sold bigint;
    v_no_show_rate numeric;
    v_prev_from date;
    v_prev_to date;
BEGIN
    -- Current period: QR scan metrics
    SELECT
        COALESCE(SUM(re.entries_count), 0),
        COUNT(*),
        COUNT(DISTINCT re.reservation_id)
    INTO v_total_entries, v_total_scans, v_unique_reservations
    FROM reservation_entries re
    JOIN reservations r ON re.reservation_id = r.id
    WHERE re.tenant_id = p_tenant_id
      AND (re.scanned_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id);

    -- Current period: Entries sold (from reservations)
    SELECT COALESCE(SUM(r.quantity), 0)
    INTO v_entries_sold
    FROM reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.reservation_date BETWEEN p_date_from AND p_date_to
      AND r.status NOT IN ('cancelled')
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id);

    -- Active sessions (checked in but not checked out, today only)
    SELECT COUNT(*)
    INTO v_active_sessions
    FROM reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.checked_in_at IS NOT NULL
      AND r.checked_out_at IS NULL
      AND r.status NOT IN ('cancelled')
      AND r.reservation_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id);

    -- Average dwell time (only completed sessions with checkout)
    SELECT COALESCE(
        ROUND(AVG(EXTRACT(EPOCH FROM (r.checked_out_at - r.checked_in_at)) / 60), 1),
        0
    )
    INTO v_avg_dwell
    FROM reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.checked_in_at IS NOT NULL
      AND r.checked_out_at IS NOT NULL
      AND r.reservation_date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id);

    -- Previous period
    v_prev_to := p_date_from - 1;
    v_prev_from := v_prev_to - (p_date_to - p_date_from);

    SELECT COALESCE(SUM(re.entries_count), 0)
    INTO v_prev_entries
    FROM reservation_entries re
    JOIN reservations r ON re.reservation_id = r.id
    WHERE re.tenant_id = p_tenant_id
      AND (re.scanned_at AT TIME ZONE 'America/Lima')::date BETWEEN v_prev_from AND v_prev_to
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id);

    SELECT COALESCE(SUM(r.quantity), 0)
    INTO v_prev_entries_sold
    FROM reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.reservation_date BETWEEN v_prev_from AND v_prev_to
      AND r.status NOT IN ('cancelled')
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id);

    -- No-show rate
    v_no_show_rate := CASE
        WHEN v_entries_sold > 0
        THEN ROUND((v_entries_sold - v_total_entries)::numeric / v_entries_sold * 100, 1)
        ELSE 0
    END;

    RETURN QUERY SELECT
        v_total_entries,
        v_total_scans,
        v_unique_reservations,
        v_active_sessions,
        v_avg_dwell,
        v_prev_entries,
        v_entries_sold,
        v_prev_entries_sold,
        v_no_show_rate;
END;
$$;

-- =============================================================
-- 3. Extend fn_kpi_hourly_attendance — add entries_sold per hour
-- =============================================================
-- Must DROP because return type changes (adding column)
DROP FUNCTION IF EXISTS public.fn_kpi_hourly_attendance(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_kpi_hourly_attendance(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    hour_of_day     integer,
    entries         bigint,
    scan_count      bigint,
    occupancy_pct   numeric,
    entries_sold    bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH scanned_hourly AS (
        SELECT
            EXTRACT(HOUR FROM re.scanned_at AT TIME ZONE 'America/Lima')::integer AS h,
            SUM(re.entries_count) AS total_entries,
            COUNT(*) AS total_scans
        FROM reservation_entries re
        JOIN reservations r ON re.reservation_id = r.id
        WHERE re.tenant_id = p_tenant_id
          AND (re.scanned_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
        GROUP BY h
    ),
    sold_hourly AS (
        SELECT
            EXTRACT(HOUR FROM r.slot_start)::integer AS h,
            SUM(r.quantity) AS total_sold
        FROM reservations r
        WHERE r.tenant_id = p_tenant_id
          AND r.reservation_date BETWEEN p_date_from AND p_date_to
          AND r.status NOT IN ('cancelled')
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
        GROUP BY h
    ),
    capacity AS (
        SELECT COALESCE(
            CASE WHEN p_branch_id IS NOT NULL
                THEN (SELECT b.max_capacity FROM branches b WHERE b.id = p_branch_id)
                ELSE (SELECT SUM(b.max_capacity) FROM branches b WHERE b.tenant_id = p_tenant_id AND b.is_active = true AND b.max_capacity IS NOT NULL)
            END, 0
        ) AS max_cap
    )
    SELECT
        COALESCE(sh.h, sl.h),
        COALESCE(sh.total_entries, 0),
        COALESCE(sh.total_scans, 0),
        CASE WHEN c.max_cap > 0
            THEN ROUND(COALESCE(sh.total_entries, 0)::numeric / (c.max_cap * GREATEST(p_date_to - p_date_from + 1, 1)) * 100, 1)
            ELSE 0
        END,
        COALESCE(sl.total_sold, 0)
    FROM scanned_hourly sh
    FULL OUTER JOIN sold_hourly sl ON sh.h = sl.h
    CROSS JOIN capacity c
    ORDER BY COALESCE(sh.h, sl.h);
$$;

-- =============================================================
-- 4. Update fn_generate_daily_snapshot — include attendance_entries_sold
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
            -- Attendance
            COALESCE((SELECT SUM(re.entries_count) FROM reservation_entries re
                JOIN reservations r ON re.reservation_id = r.id
                WHERE re.tenant_id = p_tenant_id AND r.branch_id = v_branch.id
                AND (re.scanned_at AT TIME ZONE 'America/Lima')::date = p_date), 0)::integer,
            COALESCE((SELECT COUNT(*) FROM reservation_entries re
                JOIN reservations r ON re.reservation_id = r.id
                WHERE re.tenant_id = p_tenant_id AND r.branch_id = v_branch.id
                AND (re.scanned_at AT TIME ZONE 'America/Lima')::date = p_date), 0)::integer,
            -- Entries sold (NEW)
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
