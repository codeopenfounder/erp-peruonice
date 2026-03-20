-- =====================================================================
-- Migration 00003: Schema fixes — missing tables, columns, cleanup
-- Date: 2026-03-18
-- Description: Add missing tables (promotion_combo_items, promotion_branch_filters,
--   tenant_branding), add invoices.promotion_uses, drop redundant stock_movements,
--   consolidate pin_code to fact_user_assignments only.
-- =====================================================================

-- ===== 1. NEW TABLES =====

-- promotion_combo_items: Products that form a combo promotion
CREATE TABLE IF NOT EXISTS public.promotion_combo_items (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id    uuid        NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    product_id      uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity        integer     NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_combo_unique ON public.promotion_combo_items(promotion_id, product_id);
CREATE INDEX IF NOT EXISTS idx_promo_combo_promotion ON public.promotion_combo_items(promotion_id);

-- promotion_branch_filters: Restrict promotions to specific branches
CREATE TABLE IF NOT EXISTS public.promotion_branch_filters (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id    uuid        NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    branch_id       uuid        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_branch_unique ON public.promotion_branch_filters(promotion_id, branch_id);

-- tenant_branding: POS-facing branding (fetched during auth for offline theming)
CREATE TABLE IF NOT EXISTS public.tenant_branding (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    company_name    text,
    logo_url        text,
    primary_color   text        DEFAULT '#DC2626',
    secondary_color text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ===== 2. NEW COLUMNS =====

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS promotion_uses integer NOT NULL DEFAULT 0;

-- ===== 3. CLEANUP =====

-- Drop redundant stock_movements (0 rows, replaced by inventory_movements)
DROP TABLE IF EXISTS public.stock_movements;

-- Remove duplicate pin_code from profiles (authoritative source: fact_user_assignments)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_code;

-- ===== 4. RLS POLICIES =====

ALTER TABLE public.promotion_combo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_via_promotion" ON public.promotion_combo_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_id AND p.tenant_id = public.fn_current_tenant_id()));

ALTER TABLE public.promotion_branch_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_via_promotion" ON public.promotion_branch_filters FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_id AND p.tenant_id = public.fn_current_tenant_id()));

ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_select" ON public.tenant_branding FOR SELECT TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_manage" ON public.tenant_branding FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_update" ON public.tenant_branding FOR UPDATE TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "tenant_delete" ON public.tenant_branding FOR DELETE TO authenticated
  USING (tenant_id = public.fn_current_tenant_id());
CREATE POLICY "anon_branding_select" ON public.tenant_branding FOR SELECT TO anon USING (true);

-- ===== 5. TRIGGERS =====

CREATE TRIGGER trg_tenant_branding_updated BEFORE UPDATE ON public.tenant_branding
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

-- ===== 6. SEED =====

INSERT INTO public.tenant_branding (tenant_id, company_name, primary_color)
SELECT id, name, '#DC2626' FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;
