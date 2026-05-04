-- Endurece los generadores de SKU/code contra códigos legacy no conformes
-- (e.g. SRV-PISTA-001) que rompían CAST(SUBSTRING(...) AS INTEGER) con
-- 22P02 invalid_text_representation, generando fallbacks duplicados que
-- violaban idx_products_tenant_sku.
--
-- Estrategia:
--   1. Filtrar a filas cuyo código tenga forma canónica "PREFIX-<digits>"
--      vía regex ANTES del cast.
--   2. Usar (regexp_match(...))[1]::int en lugar de SUBSTRING+CAST para
--      eliminar position-magic (FROM 5 / FROM 6).
--   3. Tomar advisory lock per (tenant, prefix) para cerrar la race
--      condition latente entre INSERTs concurrentes del mismo tenant.

CREATE OR REPLACE FUNCTION public.fn_generate_branch_code(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('branch_code:' || p_tenant_id::text));
  SELECT COALESCE(MAX((regexp_match(code, '^BRN-([0-9]+)$'))[1]::int), 0) + 1
    INTO next_num
    FROM public.branches
    WHERE tenant_id = p_tenant_id
      AND code ~ '^BRN-[0-9]+$';
  RETURN 'BRN-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_generate_product_sku(p_tenant_id UUID, p_type TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num INTEGER; prefix TEXT;
BEGIN
  prefix := CASE WHEN p_type = 'service' THEN 'SRV' ELSE 'PRD' END;
  PERFORM pg_advisory_xact_lock(hashtext('product_sku:' || p_tenant_id::text || ':' || prefix));
  SELECT COALESCE(MAX((regexp_match(sku, '^' || prefix || '-([0-9]+)$'))[1]::int), 0) + 1
    INTO next_num
    FROM public.products
    WHERE tenant_id = p_tenant_id
      AND sku ~ ('^' || prefix || '-[0-9]+$');
  RETURN prefix || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_generate_supply_sku(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('supply_sku:' || p_tenant_id::text));
  SELECT COALESCE(MAX((regexp_match(sku, '^INS-([0-9]+)$'))[1]::int), 0) + 1
    INTO next_num
    FROM public.supplies
    WHERE tenant_id = p_tenant_id
      AND sku ~ '^INS-[0-9]+$';
  RETURN 'INS-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_generate_cash_register_code(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cash_register_code:' || p_tenant_id::text));
  SELECT COALESCE(MAX((regexp_match(code, '^CAJA-([0-9]+)$'))[1]::int), 0) + 1
    INTO next_num
    FROM public.cash_registers
    WHERE tenant_id = p_tenant_id
      AND code ~ '^CAJA-[0-9]+$';
  RETURN 'CAJA-' || LPAD(next_num::TEXT, 2, '0');
END;
$$;
