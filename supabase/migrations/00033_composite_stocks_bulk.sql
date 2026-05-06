-- =====================================================================
-- Migration 00033: Bulk composite stock RPC + STABLE marker
-- Date: 2026-05-06
-- Description:
--   `getProducts` calls `fn_calculate_composite_stock(product_id)` once per
--   composite product via Promise.all. With N composites this becomes N RPC
--   round-trips. This migration adds a bulk variant that returns stocks for
--   an array of product IDs in a single round-trip.
--
--   Also marks the existing single-product function as STABLE so the planner
--   can memoize calls within a query.
-- =====================================================================

-- Mark the original as STABLE (it was VOLATILE)
CREATE OR REPLACE FUNCTION public.fn_calculate_composite_stock(p_product_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v_min_producible INT := 2147483647; v_possible INT; r RECORD;
BEGIN
  FOR r IN SELECT ri.quantity_needed, s.stock_quantity FROM public.recipe_items ri
    JOIN public.supplies s ON ri.supply_id = s.id WHERE ri.product_id = p_product_id
  LOOP
    IF r.quantity_needed > 0 THEN
      v_possible := FLOOR(r.stock_quantity / r.quantity_needed);
      v_min_producible := LEAST(v_min_producible, v_possible);
    END IF;
  END LOOP;
  IF v_min_producible = 2147483647 THEN RETURN 0; END IF;
  RETURN v_min_producible;
END;
$function$;

-- Bulk variant: receives uuid[], returns one row per id with the calculated stock.
CREATE OR REPLACE FUNCTION public.fn_calculate_composite_stocks_bulk(p_product_ids uuid[])
RETURNS TABLE(product_id uuid, stock integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT unnest(p_product_ids) AS product_id
  ),
  per_recipe AS (
    SELECT
      i.product_id,
      FLOOR(s.stock_quantity / NULLIF(ri.quantity_needed, 0))::int AS possible
    FROM input i
    LEFT JOIN public.recipe_items ri ON ri.product_id = i.product_id AND ri.quantity_needed > 0
    LEFT JOIN public.supplies s ON s.id = ri.supply_id
  )
  SELECT
    i.product_id,
    COALESCE(MIN(pr.possible), 0)::int AS stock
  FROM input i
  LEFT JOIN per_recipe pr ON pr.product_id = i.product_id
  GROUP BY i.product_id;
$$;
