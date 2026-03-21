-- ============================================================================
-- Migration 00016: Replace cortesia reason "autorizacion_gerencia" with "promocion"
-- Date: 2026-03-20
-- Description:
--   1. Update existing data
--   2. Update CHECK constraint on invoice_items.cortesia_reason
--   3. Update fn_report_control_fugas CASE mapping
-- ============================================================================

-- 1. Migrate existing data
UPDATE public.invoice_items
SET cortesia_reason = 'promocion'
WHERE cortesia_reason = 'autorizacion_gerencia';

-- 2. Update CHECK constraint
ALTER TABLE public.invoice_items DROP CONSTRAINT IF EXISTS invoice_items_cortesia_reason_check;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_cortesia_reason_check
  CHECK (is_cortesia = false OR cortesia_reason IN ('cliente_insatisfecho','falla_producto','promocion','otro'));

-- 3. Update the CASE in fn_report_control_fugas
CREATE OR REPLACE FUNCTION fn_report_control_fugas(
  p_tenant_id UUID,
  p_date_from DATE,
  p_date_to DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  fecha TEXT,
  hora TEXT,
  tipo_evento TEXT,
  producto_afectado TEXT,
  cantidad NUMERIC,
  monto_perdido NUMERIC,
  costo_asumido NUMERIC,
  motivo TEXT,
  usuario_responsable TEXT
) AS $$
BEGIN
  RETURN QUERY

  -- Source 1: Cortesias (complimentary items)
  SELECT
    TO_CHAR(inv.issue_date, 'DD/MM/YYYY'),
    TO_CHAR(inv.created_at AT TIME ZONE 'America/Lima', 'HH24:MI'),
    'Cortesia'::TEXT,
    COALESCE(p.name, s.name, ii.description)::TEXT,
    ii.quantity::NUMERIC,
    (ii.quantity * COALESCE(ii.original_unit_price, ii.unit_price))::NUMERIC,
    (ii.quantity * ii.cost_price)::NUMERIC,
    COALESCE(
      CASE ii.cortesia_reason
        WHEN 'cliente_insatisfecho' THEN 'Cliente insatisfecho'
        WHEN 'falla_producto' THEN 'Falla de producto'
        WHEN 'promocion' THEN 'Promocion'
        WHEN 'otro' THEN 'Otro'
      END,
      'Sin motivo'
    )::TEXT,
    COALESCE(CONCAT(pr.first_name, ' ', pr.last_name), 'Sin usuario')::TEXT
  FROM invoice_items ii
  JOIN invoices inv ON inv.id = ii.invoice_id
  LEFT JOIN products p ON p.id = ii.product_id
  LEFT JOIN supplies s ON s.id = ii.supply_id
  LEFT JOIN profiles pr ON pr.id = inv.cashier_id
  LEFT JOIN cash_registers cr ON cr.id = inv.cash_register_id
  WHERE ii.is_cortesia = TRUE
    AND inv.tenant_id = p_tenant_id
    AND inv.issue_date >= p_date_from
    AND inv.issue_date <= p_date_to
    AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)

  UNION ALL

  -- Source 2: Inventory losses (waste, shrinkage, breakage, staff consumption)
  SELECT
    TO_CHAR((im.created_at AT TIME ZONE 'America/Lima')::DATE, 'DD/MM/YYYY'),
    TO_CHAR(im.created_at AT TIME ZONE 'America/Lima', 'HH24:MI'),
    CASE im.movement_type
      WHEN 'waste' THEN 'Merma'
      WHEN 'shrinkage' THEN 'Perdida'
      WHEN 'breakage' THEN 'Rotura'
      WHEN 'staff_consumption' THEN 'Consumo Staff'
    END::TEXT,
    COALESCE(p.name, s.name, 'Producto desconocido')::TEXT,
    im.quantity::NUMERIC,
    CASE
      WHEN im.entity_type = 'product' THEN (im.quantity * COALESCE(p.unit_price, 0))::NUMERIC
      WHEN im.entity_type = 'supply' THEN (im.quantity * COALESCE(s.cost_price, 0))::NUMERIC
      ELSE 0::NUMERIC
    END,
    CASE
      WHEN im.entity_type = 'product' THEN (im.quantity * COALESCE(p.cost_price, 0))::NUMERIC
      WHEN im.entity_type = 'supply' THEN (im.quantity * COALESCE(s.cost_price, 0))::NUMERIC
      ELSE 0::NUMERIC
    END,
    COALESCE(im.reason, im.notes, 'Sin motivo')::TEXT,
    COALESCE(CONCAT(pr.first_name, ' ', pr.last_name), 'Sin usuario')::TEXT
  FROM inventory_movements im
  LEFT JOIN products p ON im.entity_type = 'product' AND p.id = im.entity_id
  LEFT JOIN supplies s ON im.entity_type = 'supply' AND s.id = im.entity_id
  LEFT JOIN profiles pr ON pr.id = im.created_by
  WHERE im.tenant_id = p_tenant_id
    AND im.movement_type IN ('waste', 'shrinkage', 'breakage', 'staff_consumption')
    AND (im.created_at AT TIME ZONE 'America/Lima')::DATE >= p_date_from
    AND (im.created_at AT TIME ZONE 'America/Lima')::DATE <= p_date_to
    AND (p_branch_id IS NULL OR im.branch_id = p_branch_id)

  UNION ALL

  -- Source 3: Voided invoices and Notas de Credito (full return)
  SELECT
    TO_CHAR(inv.issue_date, 'DD/MM/YYYY'),
    TO_CHAR(inv.created_at AT TIME ZONE 'America/Lima', 'HH24:MI'),
    CASE
      WHEN inv.status = 'voided' THEN 'Anulacion'
      WHEN inv.document_type = 'nota_credito' THEN 'Nota de Credito'
      ELSE 'Otro'
    END::TEXT,
    COALESCE(
      (SELECT string_agg(DISTINCT COALESCE(p2.name, ii2.description), ', ')
       FROM invoice_items ii2
       LEFT JOIN products p2 ON p2.id = ii2.product_id
       WHERE ii2.invoice_id = inv.id),
      'Sin detalle'
    )::TEXT,
    (SELECT COALESCE(SUM(ii3.quantity), 0) FROM invoice_items ii3 WHERE ii3.invoice_id = inv.id)::NUMERIC,
    inv.total::NUMERIC,
    (SELECT COALESCE(SUM(ii4.quantity * ii4.cost_price), 0) FROM invoice_items ii4 WHERE ii4.invoice_id = inv.id)::NUMERIC,
    COALESCE(inv.reference_reason,
      CASE inv.status WHEN 'voided' THEN 'Comprobante anulado' ELSE 'Sin motivo' END
    )::TEXT,
    COALESCE(CONCAT(pr.first_name, ' ', pr.last_name), 'Sin usuario')::TEXT
  FROM invoices inv
  LEFT JOIN profiles pr ON pr.id = inv.cashier_id
  LEFT JOIN cash_registers cr ON cr.id = inv.cash_register_id
  WHERE inv.tenant_id = p_tenant_id
    AND (inv.status = 'voided' OR inv.document_type = 'nota_credito')
    AND inv.issue_date >= p_date_from
    AND inv.issue_date <= p_date_to
    AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)

  ORDER BY fecha DESC, hora DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
