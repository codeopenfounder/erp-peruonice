-- ============================================================================
-- Migration 00006: Create missing fn_increment_promotion_used_count
-- The sync push calls this function but it never existed in the DB.
-- Result: used_count never incremented → stock-limited promos never depleted.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_increment_promotion_used_count(
  p_promotion_id UUID,
  p_count INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.promotions
  SET used_count = used_count + p_count,
      updated_at = NOW()
  WHERE id = p_promotion_id;
END;
$$;
