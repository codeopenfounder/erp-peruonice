-- ============================================================================
-- 00016_checkout.sql
-- Checkout/exit tracking for reservations — stops session timer
-- ============================================================================

-- 1. Add checked_out_at column
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;

-- 2. fn_register_exit — registers customer exit, stops session timer
CREATE OR REPLACE FUNCTION public.fn_register_exit(
    p_access_code    text,
    p_tenant_id      uuid,
    p_scanned_by     text DEFAULT NULL,
    p_checkout_time  timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_res RECORD;
    v_checkout_at timestamptz;
BEGIN
    SELECT r.id, r.checked_in_at, r.checked_out_at, r.customer_name,
           r.reservation_date, r.slot_start, r.slot_end,
           p.name AS service_name
    INTO v_res
    FROM reservations r
    JOIN products p ON p.id = r.product_id
    WHERE r.access_code = p_access_code AND r.tenant_id = p_tenant_id;

    IF v_res IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reserva no encontrada');
    END IF;

    IF v_res.checked_in_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se ha registrado entrada');
    END IF;

    IF v_res.checked_out_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La salida ya fue registrada');
    END IF;

    v_checkout_at := COALESCE(p_checkout_time, now());

    UPDATE reservations
    SET checked_out_at = v_checkout_at, updated_at = now()
    WHERE id = v_res.id;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_res.id,
        'checked_in_at', v_res.checked_in_at,
        'checked_out_at', v_checkout_at,
        'service_name', v_res.service_name,
        'customer_name', v_res.customer_name
    );
END;
$$;

-- 3. Update fn_lookup_reservation to include checked_out_at
CREATE OR REPLACE FUNCTION public.fn_lookup_reservation(
    p_access_code   text,
    p_tenant_id     uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_res RECORD;
    v_service_name text;
    v_branch_name text;
BEGIN
    SELECT r.*
    INTO v_res
    FROM reservations r
    WHERE r.tenant_id = p_tenant_id AND r.access_code = p_access_code;

    IF v_res IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Codigo no encontrado');
    END IF;

    SELECT p.name INTO v_service_name FROM products p WHERE p.id = v_res.product_id;
    SELECT b.name INTO v_branch_name FROM branches b WHERE b.id = v_res.branch_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_res.id,
        'access_code', v_res.access_code,
        'service_name', v_service_name,
        'branch_name', v_branch_name,
        'reservation_date', v_res.reservation_date,
        'slot_start', v_res.slot_start,
        'slot_end', v_res.slot_end,
        'quantity', v_res.quantity,
        'entries_used', v_res.entries_used,
        'remaining', v_res.quantity - v_res.entries_used,
        'status', v_res.status,
        'checked_in_at', v_res.checked_in_at,
        'checked_out_at', v_res.checked_out_at,
        'customer_name', v_res.customer_name,
        'customer_id', v_res.customer_id,
        'created_at', v_res.created_at
    );
END;
$$;
