-- ============================================================================
-- 00007_access_control.sql
-- Access codes, entry tracking, and QR-based access control for reservations
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add access control columns to reservations
-- ---------------------------------------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS access_code text,
  ADD COLUMN IF NOT EXISTS entries_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_res_access_code'
  ) THEN
    CREATE UNIQUE INDEX idx_res_access_code
      ON public.reservations(tenant_id, access_code) WHERE access_code IS NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. reservation_entries — audit trail of every scan/check-in
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservation_entries (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    reservation_id  uuid        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    entries_count   integer     NOT NULL DEFAULT 1 CHECK (entries_count > 0),
    scanned_by      text,
    scanned_at      timestamptz NOT NULL DEFAULT now(),
    notes           text
);

CREATE INDEX IF NOT EXISTS idx_re_reservation ON public.reservation_entries(reservation_id);
CREATE INDEX IF NOT EXISTS idx_re_tenant_date ON public.reservation_entries(tenant_id, scanned_at);

-- RLS
ALTER TABLE public.reservation_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.reservation_entries
  FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.reservation_entries
  FOR INSERT TO authenticated WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.reservation_entries
  FOR UPDATE TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.reservation_entries
  FOR DELETE TO authenticated USING (tenant_id = fn_current_tenant_id());

-- ---------------------------------------------------------------------------
-- 3. fn_generate_access_code — unique 6-char alphanumeric code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_access_code(p_tenant_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_code text;
    v_exists boolean;
BEGIN
    LOOP
        v_code := '';
        FOR i IN 1..6 LOOP
            v_code := v_code || substr(v_chars, floor(random() * 32 + 1)::int, 1);
        END LOOP;
        SELECT EXISTS(
            SELECT 1 FROM reservations WHERE tenant_id = p_tenant_id AND access_code = v_code
        ) INTO v_exists;
        IF NOT v_exists THEN RETURN v_code; END IF;
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Modify fn_create_reservation to auto-generate access_code
-- ---------------------------------------------------------------------------
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
    p_notes            text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schedule_id   uuid;
    v_capacity      integer;
    v_default_cap   integer;
    v_dow           smallint;
    v_current       integer;
    v_res_id        uuid;
    v_access_code   text;
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

    -- Generate unique access code
    v_access_code := fn_generate_access_code(p_tenant_id);

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

-- ---------------------------------------------------------------------------
-- 5. fn_register_entry — atomic check-in with validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_register_entry(
    p_access_code   text,
    p_tenant_id     uuid,
    p_entries_count integer DEFAULT 1,
    p_scanned_by    text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_res RECORD;
    v_remaining integer;
    v_actual_entries integer;
    v_service_name text;
BEGIN
    -- Find reservation by access code
    SELECT r.id, r.quantity, r.entries_used, r.status, r.checked_in_at,
           r.product_id, r.reservation_date, r.slot_start, r.slot_end,
           r.customer_name, r.tenant_id
    INTO v_res
    FROM reservations r
    WHERE r.tenant_id = p_tenant_id AND r.access_code = p_access_code;

    IF v_res IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Codigo no encontrado');
    END IF;

    IF v_res.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reserva cancelada');
    END IF;

    IF v_res.status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todas las entradas ya fueron usadas');
    END IF;

    v_remaining := v_res.quantity - v_res.entries_used;
    IF v_remaining <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todas las entradas ya fueron usadas');
    END IF;

    -- Cap entries to remaining
    v_actual_entries := LEAST(p_entries_count, v_remaining);

    -- Get service name
    SELECT p.name INTO v_service_name FROM products p WHERE p.id = v_res.product_id;

    -- Update reservation
    UPDATE reservations
    SET entries_used = entries_used + v_actual_entries,
        checked_in_at = COALESCE(checked_in_at, now()),
        status = CASE
            WHEN entries_used + v_actual_entries >= quantity THEN 'completed'
            ELSE status
        END,
        updated_at = now()
    WHERE id = v_res.id;

    -- Insert entry audit log
    INSERT INTO reservation_entries (tenant_id, reservation_id, entries_count, scanned_by)
    VALUES (v_res.tenant_id, v_res.id, v_actual_entries, p_scanned_by);

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_res.id,
        'entries_registered', v_actual_entries,
        'total_entries', v_res.quantity,
        'entries_used', v_res.entries_used + v_actual_entries,
        'remaining', v_res.quantity - v_res.entries_used - v_actual_entries,
        'is_complete', (v_res.entries_used + v_actual_entries >= v_res.quantity),
        'checked_in_at', COALESCE(v_res.checked_in_at, now()),
        'service_name', v_service_name,
        'reservation_date', v_res.reservation_date,
        'slot_start', v_res.slot_start,
        'slot_end', v_res.slot_end,
        'customer_name', v_res.customer_name
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. fn_lookup_reservation — read-only lookup by access code
-- ---------------------------------------------------------------------------
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
        'customer_name', v_res.customer_name,
        'customer_id', v_res.customer_id,
        'created_at', v_res.created_at
    );
END;
$$;
