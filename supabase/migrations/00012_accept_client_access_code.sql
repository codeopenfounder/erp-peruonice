-- ---------------------------------------------------------------------------
-- Fix: fn_create_reservation now accepts p_access_code from POS client.
-- If provided and unique within the tenant, uses the client's code.
-- Otherwise generates a new one server-side.
-- This ensures the QR code shown at the POS matches what's stored in Supabase.
-- ---------------------------------------------------------------------------

-- Drop the old overload (12 params) to avoid ambiguity
DROP FUNCTION IF EXISTS public.fn_create_reservation(uuid, uuid, uuid, uuid, text, uuid, date, time, time, integer, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_create_reservation(
    p_tenant_id       uuid,
    p_product_id      uuid,
    p_branch_id       uuid,
    p_customer_id     uuid,
    p_customer_name   text,
    p_invoice_id      uuid,
    p_date            date,
    p_slot_start      time,
    p_slot_end        time,
    p_quantity         integer,
    p_created_by      uuid,
    p_notes           text DEFAULT NULL,
    p_access_code     text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schedule_id   uuid;
    v_capacity      integer;
    v_default_cap   integer;
    v_dow           smallint;
    v_current       integer;
    v_res_id        uuid;
    v_access_code   text;
    v_code_exists   boolean;
BEGIN
    -- Get active schedule
    SELECT s.id, s.default_capacity
    INTO v_schedule_id, v_default_cap
    FROM service_schedules s
    WHERE s.tenant_id = p_tenant_id
      AND s.product_id = p_product_id
      AND s.branch_id = p_branch_id
      AND s.is_active = true;

    IF v_schedule_id IS NULL THEN
        RAISE EXCEPTION 'No hay horario activo para este servicio en esta sede';
    END IF;

    -- Determine capacity for this slot
    v_dow := EXTRACT(DOW FROM p_date)::smallint;

    SELECT str.capacity_override INTO v_capacity
    FROM schedule_time_ranges str
    WHERE str.schedule_id = v_schedule_id
      AND str.day_of_week = v_dow
      AND str.start_time <= p_slot_start
      AND str.end_time >= p_slot_end
    LIMIT 1;

    v_capacity := COALESCE(v_capacity, v_default_cap);

    -- Upsert slot count row
    INSERT INTO reservation_slot_counts (tenant_id, schedule_id, slot_date, slot_start, slot_end, reserved_count, capacity)
    VALUES (p_tenant_id, v_schedule_id, p_date, p_slot_start, p_slot_end, 0, v_capacity)
    ON CONFLICT (tenant_id, schedule_id, slot_date, slot_start) DO NOTHING;

    -- Lock row and check capacity
    SELECT rsc.reserved_count INTO v_current
    FROM reservation_slot_counts rsc
    WHERE rsc.tenant_id = p_tenant_id
      AND rsc.schedule_id = v_schedule_id
      AND rsc.slot_date = p_date
      AND rsc.slot_start = p_slot_start
    FOR UPDATE;

    IF v_current + p_quantity > v_capacity THEN
        RAISE EXCEPTION 'Capacidad excedida: % de % ocupados, se requieren %',
            v_current, v_capacity, p_quantity;
    END IF;

    -- Update counter
    UPDATE reservation_slot_counts
    SET reserved_count = reserved_count + p_quantity, updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND schedule_id = v_schedule_id
      AND slot_date = p_date
      AND slot_start = p_slot_start;

    -- Use client access_code if provided and unique, else generate new
    IF p_access_code IS NOT NULL AND p_access_code <> '' THEN
        SELECT EXISTS(
            SELECT 1 FROM reservations WHERE tenant_id = p_tenant_id AND access_code = p_access_code
        ) INTO v_code_exists;

        IF NOT v_code_exists THEN
            v_access_code := p_access_code;
        ELSE
            v_access_code := fn_generate_access_code(p_tenant_id);
        END IF;
    ELSE
        v_access_code := fn_generate_access_code(p_tenant_id);
    END IF;

    -- Insert reservation with access code
    INSERT INTO reservations (
        tenant_id, schedule_id, product_id, branch_id,
        customer_id, invoice_id, reservation_date, slot_start, slot_end,
        quantity, customer_name, notes, created_by, access_code
    ) VALUES (
        p_tenant_id, v_schedule_id, p_product_id, p_branch_id,
        p_customer_id, p_invoice_id, p_date, p_slot_start, p_slot_end,
        p_quantity, p_customer_name, p_notes, p_created_by, v_access_code
    ) RETURNING id INTO v_res_id;

    RETURN v_res_id;
END;
$$;
