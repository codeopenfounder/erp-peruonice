-- ============================================================
-- Migration 00023: Cash Register Arqueos (Audits)
-- Creates the arqueos table for both closing-based and
-- surprise cash register audits.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cash_register_arqueos (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cash_register_id       uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
    opening_id             uuid REFERENCES public.cash_register_openings(id) ON DELETE SET NULL,
    branch_id              uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    type                   text NOT NULL CHECK (type IN ('cierre', 'sorpresa')),

    -- Financial snapshot (immutable once created)
    opening_amount         numeric(12,2) NOT NULL DEFAULT 0,
    total_sales_cash       numeric(12,2) NOT NULL DEFAULT 0,
    total_sales_card       numeric(12,2) NOT NULL DEFAULT 0,
    total_sales_transfer   numeric(12,2) NOT NULL DEFAULT 0,
    total_income           numeric(12,2) NOT NULL DEFAULT 0,
    total_expense          numeric(12,2) NOT NULL DEFAULT 0,
    total_refunds          numeric(12,2) NOT NULL DEFAULT 0,
    total_petty_cash       numeric(12,2) NOT NULL DEFAULT 0,
    sale_count             integer NOT NULL DEFAULT 0,
    movement_count         integer NOT NULL DEFAULT 0,

    -- Count results
    expected_amount        numeric(12,2) NOT NULL,
    counted_amount         numeric(12,2) NOT NULL,
    difference             numeric(12,2) NOT NULL,

    -- PEN denomination breakdown: {"200": 2, "100": 5, "50": 1, ...}
    denomination_counts    jsonb NOT NULL DEFAULT '{}',

    -- People involved (denormalized for document immutability)
    cashier_id             uuid REFERENCES auth.users(id),
    cashier_name           text,
    supervisor_id          uuid REFERENCES auth.users(id),
    supervisor_name        text,
    created_by             uuid NOT NULL REFERENCES auth.users(id),

    -- Metadata
    notes                  text,
    period_start           timestamptz,
    period_end             timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_arqueos_tenant ON public.cash_register_arqueos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arqueos_register ON public.cash_register_arqueos(cash_register_id);
CREATE INDEX IF NOT EXISTS idx_arqueos_opening ON public.cash_register_arqueos(opening_id);
CREATE INDEX IF NOT EXISTS idx_arqueos_type_date ON public.cash_register_arqueos(tenant_id, type, created_at DESC);

-- RLS (same pattern as all other tables in the project)
ALTER TABLE public.cash_register_arqueos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.cash_register_arqueos
  FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.cash_register_arqueos
  FOR INSERT TO authenticated WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.cash_register_arqueos
  FOR UPDATE TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.cash_register_arqueos
  FOR DELETE TO authenticated USING (tenant_id = fn_current_tenant_id());
