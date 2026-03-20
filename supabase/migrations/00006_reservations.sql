-- ============================================================================
-- 00006_reservations.sql
-- Reservation system: schedules, time ranges, reservations, slot counts
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add is_schedulable to products (only services can be schedulable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_schedulable boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_schedulable_only_services'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_schedulable_only_services
      CHECK (is_schedulable = false OR type = 'service');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. service_schedules — one per service+branch, weekly template
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_schedules (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id       uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    branch_id        uuid        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    name             text,
    interval_minutes smallint    NOT NULL DEFAULT 60
                     CHECK (interval_minutes > 0 AND interval_minutes <= 480),
    default_capacity integer     NOT NULL DEFAULT 60
                     CHECK (default_capacity > 0),
    is_active        boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sched_tenant_product_branch'
  ) THEN
    CREATE UNIQUE INDEX idx_sched_tenant_product_branch
      ON public.service_schedules(tenant_id, product_id, branch_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sched_tenant    ON public.service_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sched_product   ON public.service_schedules(product_id);
CREATE INDEX IF NOT EXISTS idx_sched_branch    ON public.service_schedules(branch_id);
CREATE INDEX IF NOT EXISTS idx_sched_active    ON public.service_schedules(tenant_id, is_active)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 3. schedule_time_ranges — multiple time blocks per day with gaps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_time_ranges (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id       uuid        NOT NULL REFERENCES public.service_schedules(id) ON DELETE CASCADE,
    day_of_week       smallint    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time        time        NOT NULL,
    end_time          time        NOT NULL,
    capacity_override integer,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_time_range_valid CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_str_schedule     ON public.schedule_time_ranges(schedule_id);
CREATE INDEX IF NOT EXISTS idx_str_schedule_day ON public.schedule_time_ranges(schedule_id, day_of_week);

-- ---------------------------------------------------------------------------
-- 4. reservations — concrete bookings per date+slot
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservations (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    schedule_id      uuid        NOT NULL REFERENCES public.service_schedules(id) ON DELETE RESTRICT,
    product_id       uuid        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    branch_id        uuid        NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    customer_id      uuid        REFERENCES public.customers(id) ON DELETE SET NULL,
    invoice_id       uuid        REFERENCES public.invoices(id) ON DELETE SET NULL,
    reservation_date date        NOT NULL,
    slot_start       time        NOT NULL,
    slot_end         time        NOT NULL,
    quantity         integer     NOT NULL DEFAULT 1 CHECK (quantity > 0),
    status           text        NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('confirmed','cancelled','completed','no_show')),
    customer_name    text,
    notes            text,
    created_by       uuid        REFERENCES auth.users(id),
    cancelled_at     timestamptz,
    cancelled_by     uuid        REFERENCES auth.users(id),
    cancel_reason    text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_res_tenant          ON public.reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_res_schedule_date   ON public.reservations(schedule_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_res_slot_lookup     ON public.reservations(tenant_id, product_id, branch_id, reservation_date, slot_start)
  WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_res_invoice         ON public.reservations(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_res_customer        ON public.reservations(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_res_date            ON public.reservations(tenant_id, reservation_date);

-- ---------------------------------------------------------------------------
-- 5. reservation_slot_counts — materialized counter for O(1) capacity checks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservation_slot_counts (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    schedule_id     uuid        NOT NULL REFERENCES public.service_schedules(id) ON DELETE CASCADE,
    slot_date       date        NOT NULL,
    slot_start      time        NOT NULL,
    slot_end        time        NOT NULL,
    reserved_count  integer     NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
    capacity        integer     NOT NULL CHECK (capacity > 0),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rsc_lookup'
  ) THEN
    CREATE UNIQUE INDEX idx_rsc_lookup
      ON public.reservation_slot_counts(tenant_id, schedule_id, slot_date, slot_start);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rsc_schedule_date ON public.reservation_slot_counts(schedule_id, slot_date);

-- ---------------------------------------------------------------------------
-- 6. Triggers — updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_service_schedules_updated
  BEFORE UPDATE ON public.service_schedules
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE OR REPLACE TRIGGER trg_reservations_updated
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ---------------------------------------------------------------------------
-- 7. Functions
-- ---------------------------------------------------------------------------

-- 7a. Generate available slots for a given date
CREATE OR REPLACE FUNCTION public.fn_get_available_slots(
    p_tenant_id     uuid,
    p_product_id    uuid,
    p_branch_id     uuid,
    p_date          date
) RETURNS TABLE (
    slot_start      time,
    slot_end        time,
    capacity        integer,
    reserved_count  integer,
    available       integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schedule_id   uuid;
    v_interval      integer;
    v_default_cap   integer;
    v_dow           smallint;
BEGIN
    -- Get active schedule for this service+branch
    SELECT s.id, s.interval_minutes, s.default_capacity
    INTO v_schedule_id, v_interval, v_default_cap
    FROM service_schedules s
    WHERE s.tenant_id = p_tenant_id
      AND s.product_id = p_product_id
      AND s.branch_id = p_branch_id
      AND s.is_active = true;

    IF v_schedule_id IS NULL THEN RETURN; END IF;

    v_dow := EXTRACT(DOW FROM p_date)::smallint;

    -- Generate slots from time ranges for this day of week
    RETURN QUERY
    WITH ranges AS (
        SELECT str.start_time AS r_start, str.end_time AS r_end, str.capacity_override
        FROM schedule_time_ranges str
        WHERE str.schedule_id = v_schedule_id
          AND str.day_of_week = v_dow
    ),
    slots AS (
        SELECT
            (r.r_start + (n * (v_interval || ' minutes')::interval))::time AS s_start,
            (r.r_start + ((n + 1) * (v_interval || ' minutes')::interval))::time AS s_end,
            COALESCE(r.capacity_override, v_default_cap) AS slot_cap
        FROM ranges r
        CROSS JOIN LATERAL generate_series(0,
            EXTRACT(EPOCH FROM (r.r_end - r.r_start))::integer / (v_interval * 60) - 1
        ) AS n
    )
    SELECT
        sl.s_start,
        sl.s_end,
        sl.slot_cap,
        COALESCE(rsc.reserved_count, 0)::integer,
        (sl.slot_cap - COALESCE(rsc.reserved_count, 0))::integer
    FROM slots sl
    LEFT JOIN reservation_slot_counts rsc
      ON rsc.schedule_id = v_schedule_id
      AND rsc.slot_date = p_date
      AND rsc.slot_start = sl.s_start
    ORDER BY sl.s_start;
END;
$$;

-- 7b. Create reservation with atomic capacity check
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

    -- Insert reservation
    INSERT INTO reservations (
        tenant_id, schedule_id, product_id, branch_id,
        customer_id, invoice_id, reservation_date, slot_start, slot_end,
        quantity, customer_name, notes, created_by
    ) VALUES (
        p_tenant_id, v_schedule_id, p_product_id, p_branch_id,
        p_customer_id, p_invoice_id, p_date, p_slot_start, p_slot_end,
        p_quantity, p_customer_name, p_notes, p_created_by
    ) RETURNING id INTO v_res_id;

    RETURN v_res_id;
END;
$$;

-- 7c. Cancel reservation
CREATE OR REPLACE FUNCTION public.fn_cancel_reservation(
    p_reservation_id  uuid,
    p_cancelled_by    uuid,
    p_reason          text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_res RECORD;
BEGIN
    SELECT r.schedule_id, r.reservation_date, r.slot_start, r.quantity, r.status, r.tenant_id
    INTO v_res
    FROM reservations r
    WHERE r.id = p_reservation_id;

    IF v_res IS NULL THEN
        RAISE EXCEPTION 'Reserva no encontrada';
    END IF;

    IF v_res.status != 'confirmed' THEN
        RAISE EXCEPTION 'Solo se pueden cancelar reservas confirmadas';
    END IF;

    -- Update reservation
    UPDATE reservations
    SET status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = p_cancelled_by,
        cancel_reason = p_reason,
        updated_at = now()
    WHERE id = p_reservation_id;

    -- Decrement counter
    UPDATE reservation_slot_counts
    SET reserved_count = GREATEST(reserved_count - v_res.quantity, 0),
        updated_at = now()
    WHERE tenant_id = v_res.tenant_id
      AND schedule_id = v_res.schedule_id
      AND slot_date = v_res.reservation_date
      AND slot_start = v_res.slot_start;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS Policies
-- ---------------------------------------------------------------------------

-- service_schedules
ALTER TABLE public.service_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.service_schedules
  FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.service_schedules
  FOR INSERT TO authenticated WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.service_schedules
  FOR UPDATE TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.service_schedules
  FOR DELETE TO authenticated USING (tenant_id = fn_current_tenant_id());

-- schedule_time_ranges (access via parent schedule)
ALTER TABLE public.schedule_time_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_via_schedule_select" ON public.schedule_time_ranges
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.service_schedules s
    WHERE s.id = schedule_id AND s.tenant_id = fn_current_tenant_id()
  ));
CREATE POLICY "access_via_schedule_insert" ON public.schedule_time_ranges
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.service_schedules s
    WHERE s.id = schedule_id AND s.tenant_id = fn_current_tenant_id()
  ));
CREATE POLICY "access_via_schedule_update" ON public.schedule_time_ranges
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.service_schedules s
    WHERE s.id = schedule_id AND s.tenant_id = fn_current_tenant_id()
  ));
CREATE POLICY "access_via_schedule_delete" ON public.schedule_time_ranges
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.service_schedules s
    WHERE s.id = schedule_id AND s.tenant_id = fn_current_tenant_id()
  ));

-- reservations
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.reservations
  FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.reservations
  FOR INSERT TO authenticated WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.reservations
  FOR UPDATE TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.reservations
  FOR DELETE TO authenticated USING (tenant_id = fn_current_tenant_id());

-- reservation_slot_counts
ALTER TABLE public.reservation_slot_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.reservation_slot_counts
  FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.reservation_slot_counts
  FOR INSERT TO authenticated WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.reservation_slot_counts
  FOR UPDATE TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.reservation_slot_counts
  FOR DELETE TO authenticated USING (tenant_id = fn_current_tenant_id());
