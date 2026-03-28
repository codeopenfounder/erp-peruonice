-- =====================================================================
-- Migration 00022: Invoice Authorization Tracking
-- Date: 2026-03-26
-- Description:
--   1. Add authorization columns to invoices table
--   2. Create authorization_log table for POS audit trail
--   3. RLS policies and indexes
-- =====================================================================

-- ===== 1. AUTHORIZATION COLUMNS ON INVOICES =====
-- Track who authorized sensitive operations (void, NC, ND).
-- NULL for regular sales — only populated for voids, credit notes, debit notes.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS authorized_by uuid REFERENCES auth.users(id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS authorized_by_name text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz;

-- ===== 2. AUTHORIZATION LOG TABLE =====
-- Structured audit trail for POS authorization events.
-- Synced from SQLite via push endpoint (same pattern as invoices, movements).

CREATE TABLE IF NOT EXISTS public.authorization_log (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    invoice_id        uuid        REFERENCES public.invoices(id) ON DELETE SET NULL,
    operation         text        NOT NULL CHECK (operation IN ('void', 'nota_credito', 'nota_debito')),
    reason_code       text,
    reason_text       text,
    amount            numeric(12,2),
    cashier_id        uuid        REFERENCES auth.users(id),
    cashier_name      text,
    authorizer_id     uuid        REFERENCES auth.users(id),
    authorizer_name   text,
    authorizer_cargo  text,
    self_authorized   boolean     NOT NULL DEFAULT false,
    cash_register_id  uuid        REFERENCES public.cash_registers(id) ON DELETE SET NULL,
    opening_id        uuid        REFERENCES public.cash_register_openings(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);

-- ===== 3. INDEXES =====

CREATE INDEX IF NOT EXISTS idx_auth_log_tenant_date
  ON public.authorization_log(tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_auth_log_invoice
  ON public.authorization_log(invoice_id);

CREATE INDEX IF NOT EXISTS idx_auth_log_authorizer
  ON public.authorization_log(authorizer_id);

CREATE INDEX IF NOT EXISTS idx_invoices_authorized_by
  ON public.invoices(authorized_by) WHERE authorized_by IS NOT NULL;

-- ===== 4. RLS =====

ALTER TABLE public.authorization_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.authorization_log
  FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());

CREATE POLICY "tenant_isolation_insert" ON public.authorization_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
