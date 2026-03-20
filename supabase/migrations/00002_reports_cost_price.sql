-- ============================================================================
-- Migration 00002: Reports Module - cost_price on invoice_items + RPC functions
-- ============================================================================

-- 1. Add cost_price to invoice_items to preserve historical cost at sale time
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,4) DEFAULT 0;

-- 2. Backfill existing invoice_items with current product/supply cost_price
UPDATE invoice_items ii
SET cost_price = COALESCE(p.cost_price, 0)
FROM products p
WHERE ii.product_id = p.id AND ii.cost_price = 0;

UPDATE invoice_items ii
SET cost_price = COALESCE(s.cost_price, 0)
FROM supplies s
WHERE ii.supply_id = s.id AND ii.cost_price = 0;

-- ============================================================================
-- RPC Functions for Reports
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Report 1: Sabana General de Ventas y Transacciones
-- One row per invoice (transaction level)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_report_sabana_ventas(
  p_tenant_id UUID,
  p_date_from DATE,
  p_date_to DATE,
  p_branch_id UUID DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS TABLE (
  id_transaccion TEXT,
  fecha TEXT,
  hora TEXT,
  dia_semana TEXT,
  serie_correlativo TEXT,
  tipo_comprobante TEXT,
  metodo_pago TEXT,
  sede TEXT,
  caja TEXT,
  cajero TEXT,
  monto_total_venta NUMERIC,
  costo_total_tx NUMERIC,
  margen_bruto NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id::TEXT,
    TO_CHAR(i.issue_date, 'DD/MM/YYYY'),
    TO_CHAR(i.created_at AT TIME ZONE 'America/Lima', 'HH24:MI'),
    CASE EXTRACT(DOW FROM i.issue_date)
      WHEN 0 THEN 'Domingo'
      WHEN 1 THEN 'Lunes'
      WHEN 2 THEN 'Martes'
      WHEN 3 THEN 'Miercoles'
      WHEN 4 THEN 'Jueves'
      WHEN 5 THEN 'Viernes'
      WHEN 6 THEN 'Sabado'
    END,
    CONCAT(iser.series_code, '-', LPAD(i.correlative_number::TEXT, 8, '0')),
    CASE i.document_type
      WHEN 'boleta' THEN 'Boleta'
      WHEN 'factura' THEN 'Factura'
      WHEN 'nota_credito' THEN 'Nota de Credito'
      WHEN 'nota_debito' THEN 'Nota de Debito'
      WHEN 'ticket' THEN 'Ticket'
    END,
    CASE i.payment_method
      WHEN 'cash' THEN 'Efectivo'
      WHEN 'card' THEN 'Tarjeta'
      WHEN 'transfer' THEN 'Transferencia'
      WHEN 'mixed' THEN 'Mixto'
      WHEN 'credit' THEN 'Credito'
      ELSE 'No especificado'
    END,
    COALESCE(b.name, 'Sin sede'),
    COALESCE(cr.name, 'Sin caja'),
    COALESCE(CONCAT(pr.first_name, ' ', pr.last_name), 'Sin cajero'),
    i.total,
    COALESCE(cost_agg.costo, 0::NUMERIC),
    i.total - COALESCE(cost_agg.costo, 0::NUMERIC)
  FROM invoices i
  LEFT JOIN invoice_series iser ON iser.id = i.series_id
  LEFT JOIN cash_registers cr ON cr.id = i.cash_register_id
  LEFT JOIN branches b ON b.id = cr.branch_id
  LEFT JOIN profiles pr ON pr.id = i.cashier_id
  LEFT JOIN LATERAL (
    SELECT SUM(ii.quantity * ii.cost_price)::NUMERIC AS costo
    FROM invoice_items ii
    WHERE ii.invoice_id = i.id
  ) cost_agg ON TRUE
  WHERE i.tenant_id = p_tenant_id
    AND i.status NOT IN ('draft', 'voided')
    AND i.issue_date >= p_date_from
    AND i.issue_date <= p_date_to
    AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    AND (p_payment_method IS NULL OR i.payment_method = p_payment_method)
  ORDER BY i.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Report 3: Control de Fugas (Anulaciones, Mermas y Cortesias)
-- UNION ALL of 3 sources: cortesias, inventory losses, voided/NC invoices
-- ---------------------------------------------------------------------------
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
        WHEN 'autorizacion_gerencia' THEN 'Autorizacion de gerencia'
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

  -- Source 3: Voided invoices (full invoice amount lost)
  SELECT
    TO_CHAR(inv.issue_date, 'DD/MM/YYYY'),
    TO_CHAR(inv.created_at AT TIME ZONE 'America/Lima', 'HH24:MI'),
    CASE
      WHEN inv.status = 'voided' THEN 'Anulacion'
      WHEN inv.document_type = 'nota_credito' THEN 'Nota de Credito'
    END::TEXT,
    CONCAT(iser.series_code, '-', LPAD(inv.correlative_number::TEXT, 8, '0'))::TEXT,
    1::NUMERIC,
    inv.total::NUMERIC,
    COALESCE(cost_agg.costo, 0)::NUMERIC,
    COALESCE(inv.reference_reason, inv.notes, 'Sin motivo')::TEXT,
    COALESCE(CONCAT(pr.first_name, ' ', pr.last_name), 'Sin usuario')::TEXT
  FROM invoices inv
  LEFT JOIN invoice_series iser ON iser.id = inv.series_id
  LEFT JOIN profiles pr ON pr.id = inv.created_by
  LEFT JOIN cash_registers cr ON cr.id = inv.cash_register_id
  LEFT JOIN LATERAL (
    SELECT SUM(ii.quantity * ii.cost_price)::NUMERIC AS costo
    FROM invoice_items ii
    WHERE ii.invoice_id = inv.id
  ) cost_agg ON TRUE
  WHERE inv.tenant_id = p_tenant_id
    AND (inv.status = 'voided' OR inv.document_type = 'nota_credito')
    AND inv.issue_date >= p_date_from
    AND inv.issue_date <= p_date_to
    AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)

  ORDER BY fecha DESC, hora DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Report 4: Rendimiento de Catalogo y Mix de Ventas
-- One row per invoice_item (product-level detail)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_report_rendimiento_catalogo(
  p_tenant_id UUID,
  p_date_from DATE,
  p_date_to DATE,
  p_branch_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
  fecha TEXT,
  categoria_producto TEXT,
  nombre_producto TEXT,
  sku TEXT,
  tipo_producto TEXT,
  unidades_vendidas NUMERIC,
  costo_unitario NUMERIC,
  precio_venta_unitario NUMERIC,
  ingreso_generado NUMERIC,
  costo_generado NUMERIC,
  ganancia_neta NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(inv.issue_date, 'DD/MM/YYYY'),
    COALESCE(pc.name, 'Sin categoria')::TEXT,
    COALESCE(p.name, ii.description)::TEXT,
    COALESCE(p.sku, 'N/A')::TEXT,
    CASE
      WHEN p.type = 'product' THEN 'Producto'
      WHEN p.type = 'service' THEN 'Servicio'
      ELSE 'Otro'
    END::TEXT,
    ii.quantity,
    ii.cost_price,
    ii.unit_price,
    (ii.quantity * ii.unit_price)::NUMERIC,
    (ii.quantity * ii.cost_price)::NUMERIC,
    (ii.quantity * (ii.unit_price - ii.cost_price))::NUMERIC
  FROM invoice_items ii
  JOIN invoices inv ON inv.id = ii.invoice_id
  LEFT JOIN products p ON p.id = ii.product_id
  LEFT JOIN product_category_assignments pca ON pca.product_id = p.id
  LEFT JOIN product_categories pc ON pc.id = pca.category_id
  LEFT JOIN cash_registers cr ON cr.id = inv.cash_register_id
  WHERE inv.tenant_id = p_tenant_id
    AND inv.status NOT IN ('draft', 'voided')
    AND inv.document_type NOT IN ('nota_credito', 'nota_debito')
    AND ii.is_cortesia = FALSE
    AND inv.issue_date >= p_date_from
    AND inv.issue_date <= p_date_to
    AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    AND (p_category_id IS NULL OR pca.category_id = p_category_id)
  ORDER BY inv.issue_date DESC, p.name;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Report 5: Control Financiero y Auditoria de Caja
-- One row per cash register opening/closing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_report_control_caja(
  p_tenant_id UUID,
  p_date_from DATE,
  p_date_to DATE,
  p_cash_register_id UUID DEFAULT NULL
)
RETURNS TABLE (
  fecha TEXT,
  hora_apertura TEXT,
  hora_cierre TEXT,
  caja TEXT,
  codigo_caja TEXT,
  sede TEXT,
  estado TEXT,
  monto_apertura NUMERIC,
  monto_esperado NUMERIC,
  monto_cierre_real NUMERIC,
  descuadre NUMERIC,
  cajero_apertura TEXT,
  cajero_cierre TEXT,
  notas TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR((cro.opened_at AT TIME ZONE 'America/Lima')::DATE, 'DD/MM/YYYY'),
    TO_CHAR(cro.opened_at AT TIME ZONE 'America/Lima', 'HH24:MI'),
    CASE
      WHEN cro.closed_at IS NOT NULL THEN TO_CHAR(cro.closed_at AT TIME ZONE 'America/Lima', 'HH24:MI')
      ELSE 'Abierta'
    END,
    cr.name::TEXT,
    cr.code::TEXT,
    COALESCE(b.name, 'Sin sede')::TEXT,
    CASE cro.status
      WHEN 'open' THEN 'Abierta'
      WHEN 'closed' THEN 'Cerrada'
    END::TEXT,
    cro.opening_amount,
    COALESCE(cro.expected_amount, 0::NUMERIC),
    COALESCE(cro.closing_amount, 0::NUMERIC),
    COALESCE(cro.difference, 0::NUMERIC),
    COALESCE(CONCAT(po.first_name, ' ', po.last_name), 'Sin cajero')::TEXT,
    CASE
      WHEN cro.closed_by IS NOT NULL THEN COALESCE(CONCAT(pc.first_name, ' ', pc.last_name), 'Sin cajero')
      ELSE 'N/A'
    END::TEXT,
    COALESCE(cro.notes, '')::TEXT
  FROM cash_register_openings cro
  JOIN cash_registers cr ON cr.id = cro.cash_register_id
  LEFT JOIN branches b ON b.id = cr.branch_id
  LEFT JOIN profiles po ON po.id = cro.opened_by
  LEFT JOIN profiles pc ON pc.id = cro.closed_by
  WHERE cro.tenant_id = p_tenant_id
    AND (cro.opened_at AT TIME ZONE 'America/Lima')::DATE >= p_date_from
    AND (cro.opened_at AT TIME ZONE 'America/Lima')::DATE <= p_date_to
    AND (p_cash_register_id IS NULL OR cro.cash_register_id = p_cash_register_id)
  ORDER BY cro.opened_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Report 6: Rendimiento de Promociones y Cupones
-- One row per promotion usage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_report_rendimiento_promos(
  p_tenant_id UUID,
  p_date_from DATE,
  p_date_to DATE
)
RETURNS TABLE (
  fecha TEXT,
  hora TEXT,
  nombre_promo TEXT,
  codigo_promo TEXT,
  tipo_descuento TEXT,
  valor_descuento NUMERIC,
  monto_descontado NUMERIC,
  ingreso_real NUMERIC,
  comprobante TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR((pu.used_at AT TIME ZONE 'America/Lima')::DATE, 'DD/MM/YYYY'),
    TO_CHAR(pu.used_at AT TIME ZONE 'America/Lima', 'HH24:MI'),
    promo.name::TEXT,
    promo.code::TEXT,
    CASE promo.discount_type
      WHEN 'percentage' THEN 'Porcentaje'
      WHEN 'fixed_amount' THEN 'Monto fijo'
      WHEN 'group' THEN 'Grupal'
    END::TEXT,
    promo.discount_value,
    COALESCE(inv.promotion_discount, 0::NUMERIC),
    COALESCE(inv.total, 0::NUMERIC),
    COALESCE(CONCAT(iser.series_code, '-', LPAD(inv.correlative_number::TEXT, 8, '0')), 'Sin comprobante')::TEXT
  FROM promotion_usage pu
  JOIN promotions promo ON promo.id = pu.promotion_id
  LEFT JOIN invoices inv ON inv.id = pu.invoice_id
  LEFT JOIN invoice_series iser ON iser.id = inv.series_id
  WHERE pu.tenant_id = p_tenant_id
    AND (pu.used_at AT TIME ZONE 'America/Lima')::DATE >= p_date_from
    AND (pu.used_at AT TIME ZONE 'America/Lima')::DATE <= p_date_to
  ORDER BY pu.used_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Report 7: Inventario Valorizado (Stock Valuation)
-- One row per product/supply (current snapshot)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_report_inventario_valorizado(
  p_tenant_id UUID,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  tipo TEXT,
  sku TEXT,
  nombre TEXT,
  categoria TEXT,
  stock_actual NUMERIC,
  stock_minimo NUMERIC,
  costo_unitario NUMERIC,
  valor_total NUMERIC,
  estado_stock TEXT
) AS $$
BEGIN
  RETURN QUERY

  -- Products
  SELECT
    CASE p.type
      WHEN 'product' THEN 'Producto'
      WHEN 'service' THEN 'Servicio'
    END::TEXT,
    p.sku::TEXT,
    p.name::TEXT,
    COALESCE(pc.name, 'Sin categoria')::TEXT,
    p.stock_quantity::NUMERIC,
    COALESCE(p.min_stock, 0)::NUMERIC,
    p.cost_price::NUMERIC,
    (p.stock_quantity * p.cost_price)::NUMERIC,
    CASE
      WHEN p.stock_quantity <= 0 THEN 'Agotado'
      WHEN p.min_stock IS NOT NULL AND p.stock_quantity <= p.min_stock THEN 'Bajo'
      ELSE 'Normal'
    END::TEXT
  FROM products p
  LEFT JOIN product_category_assignments pca ON pca.product_id = p.id
  LEFT JOIN product_categories pc ON pc.id = pca.category_id
  WHERE p.tenant_id = p_tenant_id
    AND p.is_active = TRUE

  UNION ALL

  -- Supplies
  SELECT
    'Insumo'::TEXT,
    s.sku::TEXT,
    s.name::TEXT,
    COALESCE(pc.name, 'Sin categoria')::TEXT,
    s.stock_quantity::NUMERIC,
    COALESCE(s.min_stock, 0)::NUMERIC,
    s.cost_price::NUMERIC,
    (s.stock_quantity * s.cost_price)::NUMERIC,
    CASE
      WHEN s.stock_quantity <= 0 THEN 'Agotado'
      WHEN s.min_stock IS NOT NULL AND s.stock_quantity <= s.min_stock THEN 'Bajo'
      ELSE 'Normal'
    END::TEXT
  FROM supplies s
  LEFT JOIN supply_category_assignments sca ON sca.supply_id = s.id
  LEFT JOIN product_categories pc ON pc.id = sca.category_id
  WHERE s.tenant_id = p_tenant_id
    AND s.is_active = TRUE
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)

  ORDER BY tipo, nombre;
END;
$$ LANGUAGE plpgsql STABLE;
