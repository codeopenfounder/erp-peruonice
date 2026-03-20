-- ============================================================================
-- 00009_lector_assignments.sql
-- Dedicated table for POI Lector (QR reader) user assignments per branch
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lector_user_assignments (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    branch_id  uuid        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    is_active  boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lector_assign_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_lector_assign_unique
      ON public.lector_user_assignments(tenant_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lector_assign_tenant ON public.lector_user_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lector_assign_user ON public.lector_user_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_lector_assign_branch ON public.lector_user_assignments(branch_id);

-- RLS
ALTER TABLE public.lector_user_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.lector_user_assignments
  FOR SELECT TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.lector_user_assignments
  FOR INSERT TO authenticated WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.lector_user_assignments
  FOR UPDATE TO authenticated USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.lector_user_assignments
  FOR DELETE TO authenticated USING (tenant_id = fn_current_tenant_id());
