-- ============================================================================
-- Migration 00019: Report - Trafico de Asistentes vs Entradas Vendidas
-- Date: 2026-03-20
-- Description:
--   Cruza ventas POS de productos de entrada (is_schedulable) con escaneos
--   QR desde poi-lector (reservation_entries) para medir conversion.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_report_trafico_vs_entradas(
    p_tenant_id UUID,
    p_date_from DATE,
    p_date_to DATE,
    p_branch_id UUID DEFAULT NULL
) RETURNS TABLE (
    fecha               TEXT,
    hora                TEXT,
    entradas_vendidas   NUMERIC,
    qrs_escaneados      NUMERIC,
    diferencia          NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH entries_sold AS (
        SELECT
            i.issue_date AS slot_date,
            EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')::integer AS slot_hour,
            SUM(ii.quantity) AS total
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        JOIN products p ON ii.product_id = p.id
        LEFT JOIN cash_registers cr ON i.cash_register_id = cr.id
        WHERE i.tenant_id = p_tenant_id
          AND p.is_schedulable = true
          AND i.status NOT IN ('voided', 'draft')
          AND i.document_type NOT IN ('nota_credito', 'nota_debito')
          AND ii.is_cortesia = false
          AND i.issue_date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
        GROUP BY i.issue_date, EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')
    ),
    qr_scans AS (
        SELECT
            (re.scanned_at AT TIME ZONE 'America/Lima')::date AS slot_date,
            EXTRACT(HOUR FROM re.scanned_at AT TIME ZONE 'America/Lima')::integer AS slot_hour,
            SUM(re.entries_count) AS total
        FROM reservation_entries re
        JOIN reservations r ON re.reservation_id = r.id
        WHERE re.tenant_id = p_tenant_id
          AND (re.scanned_at AT TIME ZONE 'America/Lima')::date BETWEEN p_date_from AND p_date_to
          AND (p_branch_id IS NULL OR r.branch_id = p_branch_id)
        GROUP BY (re.scanned_at AT TIME ZONE 'America/Lima')::date,
                 EXTRACT(HOUR FROM re.scanned_at AT TIME ZONE 'America/Lima')
    )
    SELECT
        TO_CHAR(COALESCE(es.slot_date, qs.slot_date), 'DD/MM/YYYY'),
        LPAD(COALESCE(es.slot_hour, qs.slot_hour)::text, 2, '0') || ':00',
        COALESCE(es.total, 0),
        COALESCE(qs.total, 0),
        COALESCE(es.total, 0) - COALESCE(qs.total, 0)
    FROM entries_sold es
    FULL OUTER JOIN qr_scans qs
        ON es.slot_date = qs.slot_date AND es.slot_hour = qs.slot_hour
    ORDER BY COALESCE(es.slot_date, qs.slot_date),
             COALESCE(es.slot_hour, qs.slot_hour);
$$;
