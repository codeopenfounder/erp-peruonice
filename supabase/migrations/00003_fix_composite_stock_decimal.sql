-- ============================================================================
-- Migration 00003: Fix decimal stock decrement for composite products
-- Problem: fn_decrement_composite_stock uses INTEGER param, causing
--          decimal quantities (e.g. 0.1 KGM) to not decrement correctly
-- Fix: Change INTEGER → NUMERIC for consistency with all other stock functions
-- ============================================================================

-- 1. Drop the old INTEGER-signature function to avoid overload conflicts
DROP FUNCTION IF EXISTS public.fn_decrement_composite_stock(uuid, integer);

-- 2. Recreate with NUMERIC parameter
CREATE OR REPLACE FUNCTION public.fn_decrement_composite_stock(
  p_product_id uuid,
  p_quantity NUMERIC
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.supplies s
  SET stock_quantity = GREATEST(s.stock_quantity - (ri.quantity_needed * p_quantity), 0),
      updated_at = NOW()
  FROM public.recipe_items ri
  WHERE ri.product_id = p_product_id AND ri.supply_id = s.id;
END;
$$;

-- 3. Fix fn_decrement_stock: remove ::INT cast
CREATE OR REPLACE FUNCTION public.fn_decrement_stock(
  p_product_id uuid,
  p_quantity numeric
)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_kind TEXT; v_remaining NUMERIC;
BEGIN
  SELECT product_kind INTO v_kind FROM public.products WHERE id = p_product_id;
  IF v_kind = 'composite' THEN
    PERFORM fn_decrement_composite_stock(p_product_id, p_quantity);
    v_remaining := fn_calculate_composite_stock(p_product_id);
    UPDATE public.products SET stock_quantity = v_remaining, updated_at = NOW()
    WHERE id = p_product_id;
  ELSE
    UPDATE public.products
    SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0), updated_at = NOW()
    WHERE id = p_product_id AND type = 'product';
    SELECT stock_quantity INTO v_remaining FROM public.products WHERE id = p_product_id;
  END IF;
  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- 4. Fix fn_increment_stock: same inconsistency for NC returns
CREATE OR REPLACE FUNCTION public.fn_increment_stock(
  p_product_id uuid,
  p_quantity numeric
)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_kind TEXT; v_remaining NUMERIC;
BEGIN
  SELECT product_kind INTO v_kind FROM public.products WHERE id = p_product_id;
  IF v_kind = 'composite' THEN
    UPDATE public.supplies s
    SET stock_quantity = s.stock_quantity + (ri.quantity_needed * p_quantity), updated_at = NOW()
    FROM public.recipe_items ri
    WHERE ri.product_id = p_product_id AND ri.supply_id = s.id;
    v_remaining := fn_calculate_composite_stock(p_product_id);
    UPDATE public.products SET stock_quantity = v_remaining, updated_at = NOW()
    WHERE id = p_product_id;
  ELSE
    UPDATE public.products
    SET stock_quantity = stock_quantity + p_quantity, updated_at = NOW()
    WHERE id = p_product_id AND type = 'product';
    SELECT stock_quantity INTO v_remaining FROM public.products WHERE id = p_product_id;
  END IF;
  RETURN COALESCE(v_remaining, 0);
END;
$$;
