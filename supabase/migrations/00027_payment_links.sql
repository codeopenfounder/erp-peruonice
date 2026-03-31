-- ============================================================
-- Migration 00027: Payment Links (Culqi integration)
-- Stores payment link data for online reservations via Culqi
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_links (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Culqi data
    culqi_link_id            text,
    culqi_link_url           text,
    culqi_order_id           text,

    -- Payment info
    amount                   numeric(12,2) NOT NULL,
    currency                 text NOT NULL DEFAULT 'PEN',
    description              text,

    -- Customer info
    customer_name            text NOT NULL,
    customer_email           text,
    customer_phone           text,
    customer_document_type   text,
    customer_document_number text,

    -- Reservation intent
    product_id               uuid REFERENCES public.products(id) ON DELETE SET NULL,
    branch_id                uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    reservation_date         date,
    slot_start               time,
    slot_end                 time,
    quantity                 integer NOT NULL DEFAULT 1,

    -- Result (filled after payment)
    status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','paid','expired','cancelled','failed')),
    invoice_id               uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    reservation_id           uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
    paid_at                  timestamptz,

    -- Metadata
    created_by               uuid REFERENCES auth.users(id),
    expires_at               timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_links_tenant ON public.payment_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_culqi ON public.payment_links(culqi_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON public.payment_links(tenant_id, status);

-- RLS
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.payment_links
  FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.payment_links
  FOR INSERT TO authenticated WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.payment_links
  FOR UPDATE TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.payment_links
  FOR DELETE TO authenticated USING (tenant_id = fn_current_tenant_id());
