-- ---------------------------------------------------------------------------
-- Shared Capacity Groups
-- Allows multiple services to share a physical capacity (e.g., ice rink).
-- A reservation for one service affects availability of all others in the group.
-- Uses sweep-line algorithm for peak simultaneous occupancy calculation.
-- ---------------------------------------------------------------------------

-- 1. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.capacity_groups (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id        uuid        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    name             text        NOT NULL,
    shared_capacity  integer     NOT NULL CHECK (shared_capacity > 0),
    is_active        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cg_tenant_branch_name
    ON public.capacity_groups(tenant_id, branch_id, name);
CREATE INDEX IF NOT EXISTS idx_cg_tenant ON public.capacity_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cg_active ON public.capacity_groups(tenant_id)
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.capacity_group_members (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id         uuid        NOT NULL REFERENCES public.capacity_groups(id) ON DELETE CASCADE,
    schedule_id      uuid        NOT NULL REFERENCES public.service_schedules(id) ON DELETE CASCADE,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cgm_schedule ON public.capacity_group_members(schedule_id);
CREATE INDEX IF NOT EXISTS idx_cgm_group ON public.capacity_group_members(group_id);

-- Index for fast overlap queries in sweep-line
CREATE INDEX IF NOT EXISTS idx_res_group_overlap
    ON public.reservations(schedule_id, reservation_date, slot_start, slot_end)
    WHERE status = 'confirmed';

-- Trigger
CREATE OR REPLACE TRIGGER trg_capacity_groups_updated
    BEFORE UPDATE ON public.capacity_groups
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- 2. RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.capacity_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cg_tenant_select" ON public.capacity_groups
    FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "cg_tenant_insert" ON public.capacity_groups
    FOR INSERT TO authenticated WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "cg_tenant_update" ON public.capacity_groups
    FOR UPDATE TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "cg_tenant_delete" ON public.capacity_groups
    FOR DELETE TO authenticated USING (tenant_id = fn_current_tenant_id());

ALTER TABLE public.capacity_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cgm_access_select" ON public.capacity_group_members
    FOR SELECT TO authenticated USING (EXISTS (
        SELECT 1 FROM public.capacity_groups g WHERE g.id = group_id AND g.tenant_id = fn_current_tenant_id()
    ));
CREATE POLICY "cgm_access_insert" ON public.capacity_group_members
    FOR INSERT TO authenticated WITH CHECK (EXISTS (
        SELECT 1 FROM public.capacity_groups g WHERE g.id = group_id AND g.tenant_id = fn_current_tenant_id()
    ));
CREATE POLICY "cgm_access_update" ON public.capacity_group_members
    FOR UPDATE TO authenticated USING (EXISTS (
        SELECT 1 FROM public.capacity_groups g WHERE g.id = group_id AND g.tenant_id = fn_current_tenant_id()
    ));
CREATE POLICY "cgm_access_delete" ON public.capacity_group_members
    FOR DELETE TO authenticated USING (EXISTS (
        SELECT 1 FROM public.capacity_groups g WHERE g.id = group_id AND g.tenant_id = fn_current_tenant_id()
    ));

-- 3. Sweep-Line Peak Occupancy Function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_group_peak_occupancy(
    p_group_id      uuid,
    p_date          date,
    p_window_start  time,
    p_window_end    time
) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_peak    integer := 0;
    v_current integer := 0;
    rec       RECORD;
BEGIN
    FOR rec IN
        WITH overlapping AS (
            SELECT r.slot_start, r.slot_end, r.quantity
            FROM reservations r
            JOIN capacity_group_members cgm ON cgm.schedule_id = r.schedule_id
            WHERE cgm.group_id = p_group_id
              AND r.reservation_date = p_date
              AND r.status = 'confirmed'
              AND r.slot_start < p_window_end
              AND r.slot_end > p_window_start
        ),
        events AS (
            SELECT GREATEST(slot_start, p_window_start) AS event_time, quantity AS delta
            FROM overlapping
            UNION ALL
            SELECT LEAST(slot_end, p_window_end) AS event_time, -quantity AS delta
            FROM overlapping
        )
        SELECT event_time, delta
        FROM events
        ORDER BY event_time ASC, delta ASC
    LOOP
        v_current := v_current + rec.delta;
        IF v_current > v_peak THEN
            v_peak := v_current;
        END IF;
    END LOOP;

    RETURN v_peak;
END;
$$;

-- 4. Updated fn_create_reservation (group-aware)
-- ---------------------------------------------------------------------------

-- Drop all existing overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.fn_create_reservation(uuid, uuid, uuid, uuid, text, uuid, date, time, time, integer, uuid, text);
DROP FUNCTION IF EXISTS public.fn_create_reservation(uuid, uuid, uuid, uuid, text, uuid, date, time, time, integer, uuid, text, text);

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
    v_group_id      uuid;
    v_group_cap     integer;
    v_group_peak    integer;
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

    v_dow := EXTRACT(DOW FROM p_date)::smallint;

    -- Check if schedule belongs to a capacity group
    SELECT cg.id, cg.shared_capacity
    INTO v_group_id, v_group_cap
    FROM capacity_group_members cgm
    JOIN capacity_groups cg ON cg.id = cgm.group_id AND cg.is_active = true
    WHERE cgm.schedule_id = v_schedule_id;

    IF v_group_id IS NOT NULL THEN
        -- GROUPED MODE: lock group row for serialization
        PERFORM 1 FROM capacity_groups WHERE id = v_group_id FOR UPDATE;

        v_group_peak := fn_group_peak_occupancy(v_group_id, p_date, p_slot_start, p_slot_end);

        IF v_group_peak + p_quantity > v_group_cap THEN
            RAISE EXCEPTION 'Capacidad de grupo excedida: % de % ocupados, se requieren %',
                v_group_peak, v_group_cap, p_quantity;
        END IF;

        v_capacity := v_group_cap;
    ELSE
        -- UNGROUPED MODE: original per-schedule logic
        SELECT str.capacity_override INTO v_capacity
        FROM schedule_time_ranges str
        WHERE str.schedule_id = v_schedule_id
          AND str.day_of_week = v_dow
          AND str.start_time <= p_slot_start
          AND str.end_time >= p_slot_end
        LIMIT 1;

        v_capacity := COALESCE(v_capacity, v_default_cap);
    END IF;

    -- Maintain per-schedule slot counts (for both modes — used by sync/reporting)
    INSERT INTO reservation_slot_counts (tenant_id, schedule_id, slot_date, slot_start, slot_end, reserved_count, capacity)
    VALUES (p_tenant_id, v_schedule_id, p_date, p_slot_start, p_slot_end, 0, v_capacity)
    ON CONFLICT (tenant_id, schedule_id, slot_date, slot_start) DO NOTHING;

    IF v_group_id IS NULL THEN
        -- Only check per-schedule counts in ungrouped mode
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
    END IF;

    -- Update per-schedule counter
    UPDATE reservation_slot_counts
    SET reserved_count = reserved_count + p_quantity, updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND schedule_id = v_schedule_id
      AND slot_date = p_date
      AND slot_start = p_slot_start;

    -- Access code: use client code if unique, else generate
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

    -- Insert reservation
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
