-- ---------------------------------------------------------------------------
-- Add time validation to fn_register_entry.
-- Rejects check-in if Peru time is past slot_end on the reservation date.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_register_entry(
    p_access_code   text,
    p_tenant_id     uuid,
    p_entries_count integer DEFAULT 1,
    p_scanned_by    text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_res             RECORD;
    v_remaining       integer;
    v_actual_entries  integer;
    v_now_peru        timestamptz;
    v_slot_end_ts     timestamptz;
BEGIN
    -- Find reservation by access code
    SELECT r.id, r.tenant_id, r.reservation_date, r.slot_start, r.slot_end,
           r.quantity, r.entries_used, r.status, r.checked_in_at,
           r.customer_name, r.product_id,
           p.name AS service_name
    INTO v_res
    FROM reservations r
    JOIN products p ON p.id = r.product_id
    WHERE r.access_code = p_access_code
      AND r.tenant_id = p_tenant_id;

    IF v_res IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reserva no encontrada');
    END IF;

    IF v_res.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reserva cancelada');
    END IF;

    IF v_res.status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todas las entradas ya fueron utilizadas');
    END IF;

    -- Time validation: check if slot has expired (Peru timezone)
    v_now_peru := now() AT TIME ZONE 'America/Lima';
    v_slot_end_ts := (v_res.reservation_date || ' ' || v_res.slot_end)::timestamp;

    IF v_now_peru > v_slot_end_ts THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El turno ya finalizo. No se puede registrar acceso despues del horario.'
        );
    END IF;

    v_remaining := v_res.quantity - v_res.entries_used;

    IF v_remaining <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No quedan entradas disponibles');
    END IF;

    v_actual_entries := LEAST(p_entries_count, v_remaining);

    -- Update reservation
    UPDATE reservations
    SET entries_used = entries_used + v_actual_entries,
        checked_in_at = COALESCE(checked_in_at, now()),
        status = CASE
            WHEN entries_used + v_actual_entries >= quantity THEN 'completed'
            ELSE status
        END
    WHERE id = v_res.id;

    -- Audit log
    INSERT INTO reservation_entries (tenant_id, reservation_id, entries_count, scanned_by)
    VALUES (p_tenant_id, v_res.id, v_actual_entries, p_scanned_by);

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_res.id,
        'entries_registered', v_actual_entries,
        'total_entries', v_res.quantity,
        'entries_used', v_res.entries_used + v_actual_entries,
        'remaining', v_res.quantity - (v_res.entries_used + v_actual_entries),
        'is_complete', (v_res.entries_used + v_actual_entries >= v_res.quantity),
        'checked_in_at', COALESCE(v_res.checked_in_at, now()),
        'service_name', v_res.service_name,
        'reservation_date', v_res.reservation_date,
        'slot_start', v_res.slot_start,
        'slot_end', v_res.slot_end,
        'customer_name', v_res.customer_name
    );
END;
$$;
