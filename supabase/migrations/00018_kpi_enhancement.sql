-- ============================================================================
-- Migration 00018: KPI System Enhancement
-- Date: 2026-03-20
-- Description:
--   0. Add max_capacity to branches (missing from live DB)
--   1. New fn_kpi_attendance — attendance metrics from reservation_entries
--   2. New fn_kpi_hourly_attendance — hourly attendance with occupancy %
--   3. Update fn_kpi_hourly_sales — support date ranges (not just single day)
--   4. Update fn_kpi_operational_leaks — unify voided + nota_credito as "anulaciones"
--   5. Update fn_kpi_inventory_health — add staff_consumption tracking
--   6. Add attendance columns to kpi_daily_snapshots
--   7. Update fn_generate_daily_snapshot — include attendance data
-- ============================================================================

-- =============================================================
-- 0. Add max_capacity to branches (defined in schema but missing in live DB)
-- =============================================================
ALTER TABLE public.branches
    ADD COLUMN IF NOT EXISTS max_capacity integer;

-- =============================================================
-- 1. fn_kpi_attendance: Attendance metrics from QR scans
-- =============================================================
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
    prev_total_entries   bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_total_entries bigint;
    v_total_scans bigint;
    v_unique_reservations bigint;
    v_active_sessions bigint;
    v_avg_dwell numeric;
    v_prev_entries bigint;
    v_diff interval;
    v_prev_from date;
    v_prev_to date;
BEGIN
    -- Current period
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

    -- Previous period (same duration, immediately before)
    v_diff := (p_date_to - p_date_from + 1) * INTERVAL '1 day';
    v_prev_to := p_date_from - 1;
    v_prev_from := v_prev_to - (p_date_to - p_date_from);

    SELECT COALESCE(SUM(re.entries_count), 0)
    INTO v_prev_entries
    FROM reservation_entries re
    JOIN reservations r ON re.reservation_id = r.id
    WHERE re.tenant_id = p_tenant_id
      AND (re.scanned_at AT TIME ZONE 'America/Lima')::date BETWEEN v_prev_from AND v_prev_to
      AND (p_branch_id IS NULL OR r.branch_id = p_branch_id);

    RETURN QUERY SELECT
        v_total_entries,
        v_total_scans,
        v_unique_reservations,
        v_active_sessions,
        v_avg_dwell,
        v_prev_entries;
END;
$$;

-- =============================================================
-- 2. fn_kpi_hourly_attendance: Hourly breakdown with occupancy %
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_kpi_hourly_attendance(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    hour_of_day     integer,
    entries         bigint,
    scan_count      bigint,
    occupancy_pct   numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH hourly AS (
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
    capacity AS (
        SELECT COALESCE(
            CASE WHEN p_branch_id IS NOT NULL
                THEN (SELECT b.max_capacity FROM branches b WHERE b.id = p_branch_id)
                ELSE (SELECT SUM(b.max_capacity) FROM branches b WHERE b.tenant_id = p_tenant_id AND b.is_active = true AND b.max_capacity IS NOT NULL)
            END, 0
        ) AS max_cap
    )
    SELECT
        h.h,
        h.total_entries,
        h.total_scans,
        CASE WHEN c.max_cap > 0
            THEN ROUND(h.total_entries::numeric / (c.max_cap * GREATEST(p_date_to - p_date_from + 1, 1)) * 100, 1)
            ELSE 0
        END
    FROM hourly h, capacity c
    ORDER BY h.h;
$$;

-- =============================================================
-- 3. Update fn_kpi_hourly_sales: Support date ranges
-- =============================================================
-- Drop old single-date signature to allow new date-range signature
DROP FUNCTION IF EXISTS public.fn_kpi_hourly_sales(uuid, uuid, date);
CREATE OR REPLACE FUNCTION public.fn_kpi_hourly_sales(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT CURRENT_DATE,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    hour_of_day     integer,
    revenue         numeric,
    tx_count        bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH daily_hours AS (
        SELECT
            EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')::integer AS hour_of_day,
            i.total,
            i.issue_date
        FROM invoices i
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id
          AND i.status NOT IN ('voided', 'draft')
          AND i.document_type NOT IN ('nota_credito', 'nota_debito')
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    ),
    num_days AS (
        SELECT GREATEST(COUNT(DISTINCT issue_date), 1)::numeric AS d
        FROM daily_hours
    )
    SELECT
        dh.hour_of_day,
        CASE
            WHEN (SELECT d FROM num_days) = 1 THEN COALESCE(SUM(dh.total), 0)
            ELSE ROUND(COALESCE(SUM(dh.total), 0) / (SELECT d FROM num_days), 2)
        END AS revenue,
        CASE
            WHEN (SELECT d FROM num_days) = 1 THEN COUNT(*)
            ELSE ROUND(COUNT(*)::numeric / (SELECT d FROM num_days))::bigint
        END AS tx_count
    FROM daily_hours dh
    GROUP BY dh.hour_of_day
    ORDER BY dh.hour_of_day;
$$;

-- =============================================================
-- 4. Update fn_kpi_operational_leaks: Unify voided + nota_credito
-- =============================================================
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
    -- Total valid transactions (excludes voided, draft, NC, ND)
    SELECT COUNT(*), COALESCE(SUM(i.total), 0)
    INTO v_total_tx, v_total_revenue
    FROM invoices i
    LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
    WHERE i.tenant_id = p_tenant_id
      AND i.status NOT IN ('voided', 'draft')
      AND i.document_type NOT IN ('nota_credito', 'nota_debito')
      AND i.issue_date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id);

    -- Anulaciones: voided invoices + notas de credito (unified)
    SELECT COUNT(*), COALESCE(SUM(i.total), 0)
    INTO v_voided_count, v_voided_amount
    FROM invoices i
    LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
    WHERE i.tenant_id = p_tenant_id
      AND (i.status = 'voided' OR i.document_type = 'nota_credito')
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

-- =============================================================
-- 5. Update fn_kpi_inventory_health: Add staff_consumption
-- =============================================================
-- Drop old signature to allow adding new return columns
DROP FUNCTION IF EXISTS public.fn_kpi_inventory_health(uuid, uuid, date, date);
CREATE OR REPLACE FUNCTION public.fn_kpi_inventory_health(
    p_tenant_id uuid,
    p_branch_id uuid DEFAULT NULL,
    p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
    p_date_to date DEFAULT CURRENT_DATE
) RETURNS TABLE (
    total_audits                bigint,
    items_audited               bigint,
    items_with_discrepancy      bigint,
    total_discrepancy_value     numeric,
    efficiency_pct              numeric,
    waste_movements             bigint,
    waste_value                 numeric,
    shrinkage_movements         bigint,
    shrinkage_value             numeric,
    breakage_movements          bigint,
    breakage_value              numeric,
    staff_consumption_movements bigint,
    staff_consumption_value     numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH audit_data AS (
        SELECT
            COUNT(DISTINCT a.id) AS total_audits,
            COALESCE(SUM(a.items_audited), 0) AS items_audited,
            COALESCE(SUM(a.items_adjusted), 0) AS items_with_discrepancy,
            COALESCE(SUM(ABS(a.total_discrepancy_value)), 0) AS total_discrepancy_value
        FROM inventory_audits a
        WHERE a.tenant_id = p_tenant_id
          AND a.status = 'approved'
          AND a.created_at::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
    ),
    movement_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE im.movement_type = 'waste') AS waste_movements,
            COUNT(*) FILTER (WHERE im.movement_type = 'shrinkage') AS shrinkage_movements,
            COUNT(*) FILTER (WHERE im.movement_type = 'breakage') AS breakage_movements,
            COUNT(*) FILTER (WHERE im.movement_type = 'staff_consumption') AS staff_consumption_movements
        FROM inventory_movements im
        WHERE im.tenant_id = p_tenant_id
          AND im.movement_type IN ('waste', 'shrinkage', 'breakage', 'staff_consumption')
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
            ELSE 0 END), 0) AS breakage_value,
            COALESCE(SUM(CASE WHEN im.movement_type = 'staff_consumption' THEN
                im.quantity * COALESCE(
                    CASE WHEN im.entity_type = 'product' THEN p.cost_price
                         WHEN im.entity_type = 'supply' THEN s.cost_price END, 0)
            ELSE 0 END), 0) AS staff_consumption_value
        FROM inventory_movements im
        LEFT JOIN products p ON im.entity_type = 'product' AND im.entity_id = p.id
        LEFT JOIN supplies s ON im.entity_type = 'supply' AND im.entity_id = s.id
        WHERE im.tenant_id = p_tenant_id
          AND im.movement_type IN ('waste', 'shrinkage', 'breakage', 'staff_consumption')
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
        mv.breakage_value,
        mc.staff_consumption_movements,
        mv.staff_consumption_value
    FROM audit_data ad, movement_counts mc, movement_values mv;
$$;

-- =============================================================
-- 6. Add attendance columns to kpi_daily_snapshots
-- =============================================================
ALTER TABLE public.kpi_daily_snapshots
    ADD COLUMN IF NOT EXISTS attendance_entries integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS attendance_scans integer NOT NULL DEFAULT 0;

-- =============================================================
-- 7. Update fn_generate_daily_snapshot — include attendance
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
            attendance_entries, attendance_scans
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
            -- Voided: now includes both voided status AND notas de credito
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
                AND (re.scanned_at AT TIME ZONE 'America/Lima')::date = p_date), 0)::integer
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
        attendance_entries, attendance_scans
    )
    SELECT
        p_tenant_id, NULL, p_date,
        SUM(total_revenue), SUM(transaction_count),
        CASE WHEN SUM(transaction_count) > 0 THEN ROUND(SUM(total_revenue) / SUM(transaction_count), 2) ELSE 0 END,
        SUM(revenue_cash), SUM(revenue_card), SUM(revenue_transfer), SUM(revenue_credit), SUM(revenue_mixed),
        SUM(voided_count), SUM(voided_amount), SUM(cortesia_count), SUM(cortesia_amount),
        SUM(promotion_tx_count), SUM(promotion_discount_total),
        SUM(inventory_shrinkage_value), SUM(inventory_waste_value),
        SUM(attendance_entries), SUM(attendance_scans)
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
        computed_at = now();
END;
$$;
