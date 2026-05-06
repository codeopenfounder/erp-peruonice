-- =====================================================================
-- Migration 00031: Simplify RLS for single-tenant deployment
-- Date: 2026-05-06
-- Description:
--   Peru On Ice is the only tenant of this system. The 109 RLS policies
--   that filter by `tenant_id = fn_current_tenant_id()` cause Postgres to
--   re-evaluate fn_current_tenant_id() per row scanned (it queries `profiles`
--   internally), generating 285,863 sequential scans on a 6-row `profiles`
--   table.
--
--   This migration:
--     1. Snapshots pg_policies for rollback.
--     2. Drops all tenant-isolation policies and replaces them with simple
--        `USING (true) FOR authenticated` policies. RLS stays enabled
--        (anon traffic remains blocked) but no longer evaluates per-row
--        function calls.
--     3. Wraps `auth.uid()` in `(SELECT auth.uid())` for the 5 user-scoped
--        policies (notifications, profiles, user_preferences) so the planner
--        treats it as InitPlan (one-shot evaluation per query).
--
--   The `tenant_id` column stays in all tables; only RLS filtering changes.
--   `fn_current_tenant_id()` is preserved (server actions still call it for
--   convenience) but is no longer used inside RLS evaluation.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1: Snapshot pg_policies for rollback
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public._rls_backup_2026_05_06;
CREATE TABLE public._rls_backup_2026_05_06 AS
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- ---------------------------------------------------------------------
-- STEP 2: Replace tenant-isolation policies on tables with the
--         standard 4-policy CRUD pattern
-- ---------------------------------------------------------------------

-- audit_log (read-only)
DROP POLICY IF EXISTS tenant_read_audit ON public.audit_log;
CREATE POLICY auth_select ON public.audit_log FOR SELECT TO authenticated USING (true);

-- authorization_log (insert + select only)
DROP POLICY IF EXISTS tenant_isolation_insert ON public.authorization_log;
DROP POLICY IF EXISTS tenant_isolation_select ON public.authorization_log;
CREATE POLICY auth_insert ON public.authorization_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_select ON public.authorization_log FOR SELECT TO authenticated USING (true);

-- branches
DROP POLICY IF EXISTS tenant_isolation_select ON public.branches;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.branches;
DROP POLICY IF EXISTS tenant_isolation_update ON public.branches;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.branches;
CREATE POLICY auth_select ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.branches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.branches FOR DELETE TO authenticated USING (true);

-- capacity_groups
DROP POLICY IF EXISTS cg_tenant_select ON public.capacity_groups;
DROP POLICY IF EXISTS cg_tenant_insert ON public.capacity_groups;
DROP POLICY IF EXISTS cg_tenant_update ON public.capacity_groups;
DROP POLICY IF EXISTS cg_tenant_delete ON public.capacity_groups;
CREATE POLICY auth_select ON public.capacity_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.capacity_groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.capacity_groups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.capacity_groups FOR DELETE TO authenticated USING (true);

-- capacity_group_members
DROP POLICY IF EXISTS cgm_access_select ON public.capacity_group_members;
DROP POLICY IF EXISTS cgm_access_insert ON public.capacity_group_members;
DROP POLICY IF EXISTS cgm_access_update ON public.capacity_group_members;
DROP POLICY IF EXISTS cgm_access_delete ON public.capacity_group_members;
CREATE POLICY auth_all ON public.capacity_group_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cash_register_arqueos
DROP POLICY IF EXISTS tenant_isolation_select ON public.cash_register_arqueos;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.cash_register_arqueos;
DROP POLICY IF EXISTS tenant_isolation_update ON public.cash_register_arqueos;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.cash_register_arqueos;
CREATE POLICY auth_select ON public.cash_register_arqueos FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.cash_register_arqueos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.cash_register_arqueos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.cash_register_arqueos FOR DELETE TO authenticated USING (true);

-- cash_register_movements
DROP POLICY IF EXISTS tenant_isolation_select ON public.cash_register_movements;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.cash_register_movements;
DROP POLICY IF EXISTS tenant_isolation_update ON public.cash_register_movements;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.cash_register_movements;
CREATE POLICY auth_select ON public.cash_register_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.cash_register_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.cash_register_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.cash_register_movements FOR DELETE TO authenticated USING (true);

-- cash_register_openings
DROP POLICY IF EXISTS tenant_isolation_select ON public.cash_register_openings;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.cash_register_openings;
DROP POLICY IF EXISTS tenant_isolation_update ON public.cash_register_openings;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.cash_register_openings;
CREATE POLICY auth_select ON public.cash_register_openings FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.cash_register_openings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.cash_register_openings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.cash_register_openings FOR DELETE TO authenticated USING (true);

-- cash_registers
DROP POLICY IF EXISTS tenant_isolation_select ON public.cash_registers;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.cash_registers;
DROP POLICY IF EXISTS tenant_isolation_update ON public.cash_registers;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.cash_registers;
CREATE POLICY auth_select ON public.cash_registers FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.cash_registers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.cash_registers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.cash_registers FOR DELETE TO authenticated USING (true);

-- customers
DROP POLICY IF EXISTS tenant_isolation_select ON public.customers;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.customers;
DROP POLICY IF EXISTS tenant_isolation_update ON public.customers;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.customers;
CREATE POLICY auth_select ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.customers FOR DELETE TO authenticated USING (true);

-- expense_fund_movements (insert + select only)
DROP POLICY IF EXISTS efm_insert ON public.expense_fund_movements;
DROP POLICY IF EXISTS efm_select ON public.expense_fund_movements;
CREATE POLICY auth_insert ON public.expense_fund_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_select ON public.expense_fund_movements FOR SELECT TO authenticated USING (true);

-- fact_config (preserve anon_fact_config_select)
DROP POLICY IF EXISTS tenant_isolation_select ON public.fact_config;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.fact_config;
DROP POLICY IF EXISTS tenant_isolation_update ON public.fact_config;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.fact_config;
CREATE POLICY auth_select ON public.fact_config FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.fact_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.fact_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.fact_config FOR DELETE TO authenticated USING (true);

-- fact_user_assignments (preserve anon_fact_users_select)
DROP POLICY IF EXISTS tenant_isolation_select ON public.fact_user_assignments;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.fact_user_assignments;
DROP POLICY IF EXISTS tenant_isolation_update ON public.fact_user_assignments;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.fact_user_assignments;
CREATE POLICY auth_select ON public.fact_user_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.fact_user_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.fact_user_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.fact_user_assignments FOR DELETE TO authenticated USING (true);

-- inventory_audits
DROP POLICY IF EXISTS tenant_isolation_select ON public.inventory_audits;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.inventory_audits;
DROP POLICY IF EXISTS tenant_isolation_update ON public.inventory_audits;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.inventory_audits;
CREATE POLICY auth_select ON public.inventory_audits FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.inventory_audits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.inventory_audits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.inventory_audits FOR DELETE TO authenticated USING (true);

-- inventory_audit_items
DROP POLICY IF EXISTS access_via_audit ON public.inventory_audit_items;
CREATE POLICY auth_all ON public.inventory_audit_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- inventory_movements
DROP POLICY IF EXISTS tenant_isolation_select ON public.inventory_movements;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.inventory_movements;
DROP POLICY IF EXISTS tenant_isolation_update ON public.inventory_movements;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.inventory_movements;
CREATE POLICY auth_select ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.inventory_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.inventory_movements FOR DELETE TO authenticated USING (true);

-- invoices
DROP POLICY IF EXISTS tenant_isolation_select ON public.invoices;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.invoices;
DROP POLICY IF EXISTS tenant_isolation_update ON public.invoices;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.invoices;
CREATE POLICY auth_select ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.invoices FOR DELETE TO authenticated USING (true);

-- invoice_items
DROP POLICY IF EXISTS access_via_invoice ON public.invoice_items;
CREATE POLICY auth_all ON public.invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- invoice_series
DROP POLICY IF EXISTS tenant_isolation_select ON public.invoice_series;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.invoice_series;
DROP POLICY IF EXISTS tenant_isolation_update ON public.invoice_series;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.invoice_series;
CREATE POLICY auth_select ON public.invoice_series FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.invoice_series FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.invoice_series FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.invoice_series FOR DELETE TO authenticated USING (true);

-- kpi_daily_snapshots
DROP POLICY IF EXISTS tenant_select ON public.kpi_daily_snapshots;
DROP POLICY IF EXISTS tenant_insert ON public.kpi_daily_snapshots;
DROP POLICY IF EXISTS tenant_update ON public.kpi_daily_snapshots;
DROP POLICY IF EXISTS tenant_delete ON public.kpi_daily_snapshots;
CREATE POLICY auth_select ON public.kpi_daily_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.kpi_daily_snapshots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.kpi_daily_snapshots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.kpi_daily_snapshots FOR DELETE TO authenticated USING (true);

-- lector_user_assignments
DROP POLICY IF EXISTS tenant_isolation_select ON public.lector_user_assignments;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.lector_user_assignments;
DROP POLICY IF EXISTS tenant_isolation_update ON public.lector_user_assignments;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.lector_user_assignments;
CREATE POLICY auth_select ON public.lector_user_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.lector_user_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.lector_user_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.lector_user_assignments FOR DELETE TO authenticated USING (true);

-- payment_links
DROP POLICY IF EXISTS tenant_isolation_select ON public.payment_links;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.payment_links;
DROP POLICY IF EXISTS tenant_isolation_update ON public.payment_links;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.payment_links;
CREATE POLICY auth_select ON public.payment_links FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.payment_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.payment_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.payment_links FOR DELETE TO authenticated USING (true);

-- product_categories
DROP POLICY IF EXISTS tenant_isolation_select ON public.product_categories;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.product_categories;
DROP POLICY IF EXISTS tenant_isolation_update ON public.product_categories;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.product_categories;
CREATE POLICY auth_select ON public.product_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.product_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.product_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.product_categories FOR DELETE TO authenticated USING (true);

-- product_category_assignments
DROP POLICY IF EXISTS access_via_product ON public.product_category_assignments;
CREATE POLICY auth_all ON public.product_category_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- product_tags
DROP POLICY IF EXISTS tenant_isolation_select ON public.product_tags;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.product_tags;
DROP POLICY IF EXISTS tenant_isolation_update ON public.product_tags;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.product_tags;
CREATE POLICY auth_select ON public.product_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.product_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.product_tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.product_tags FOR DELETE TO authenticated USING (true);

-- product_tag_assignments
DROP POLICY IF EXISTS access_via_product ON public.product_tag_assignments;
CREATE POLICY auth_all ON public.product_tag_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- products
DROP POLICY IF EXISTS tenant_isolation_select ON public.products;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.products;
DROP POLICY IF EXISTS tenant_isolation_update ON public.products;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.products;
CREATE POLICY auth_select ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.products FOR DELETE TO authenticated USING (true);

-- promotion_branch_filters
DROP POLICY IF EXISTS access_via_promotion ON public.promotion_branch_filters;
CREATE POLICY auth_all ON public.promotion_branch_filters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- promotion_category_filters
DROP POLICY IF EXISTS access_via_promotion ON public.promotion_category_filters;
CREATE POLICY auth_all ON public.promotion_category_filters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- promotion_combo_items
DROP POLICY IF EXISTS access_via_promotion ON public.promotion_combo_items;
CREATE POLICY auth_all ON public.promotion_combo_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- promotion_tag_filters
DROP POLICY IF EXISTS access_via_promotion ON public.promotion_tag_filters;
CREATE POLICY auth_all ON public.promotion_tag_filters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- promotion_usage
DROP POLICY IF EXISTS tenant_isolation_select ON public.promotion_usage;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.promotion_usage;
DROP POLICY IF EXISTS tenant_isolation_update ON public.promotion_usage;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.promotion_usage;
CREATE POLICY auth_select ON public.promotion_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.promotion_usage FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.promotion_usage FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.promotion_usage FOR DELETE TO authenticated USING (true);

-- promotions
DROP POLICY IF EXISTS tenant_isolation_select ON public.promotions;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.promotions;
DROP POLICY IF EXISTS tenant_isolation_update ON public.promotions;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.promotions;
CREATE POLICY auth_select ON public.promotions FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.promotions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.promotions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.promotions FOR DELETE TO authenticated USING (true);

-- recipe_items
DROP POLICY IF EXISTS access_via_product ON public.recipe_items;
CREATE POLICY auth_all ON public.recipe_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- reservations
DROP POLICY IF EXISTS tenant_isolation_select ON public.reservations;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.reservations;
DROP POLICY IF EXISTS tenant_isolation_update ON public.reservations;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.reservations;
CREATE POLICY auth_select ON public.reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.reservations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.reservations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.reservations FOR DELETE TO authenticated USING (true);

-- reservation_entries
DROP POLICY IF EXISTS tenant_isolation_select ON public.reservation_entries;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.reservation_entries;
DROP POLICY IF EXISTS tenant_isolation_update ON public.reservation_entries;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.reservation_entries;
CREATE POLICY auth_select ON public.reservation_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.reservation_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.reservation_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.reservation_entries FOR DELETE TO authenticated USING (true);

-- reservation_slot_counts
DROP POLICY IF EXISTS tenant_isolation_select ON public.reservation_slot_counts;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.reservation_slot_counts;
DROP POLICY IF EXISTS tenant_isolation_update ON public.reservation_slot_counts;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.reservation_slot_counts;
CREATE POLICY auth_select ON public.reservation_slot_counts FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.reservation_slot_counts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.reservation_slot_counts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.reservation_slot_counts FOR DELETE TO authenticated USING (true);

-- schedule_time_ranges
DROP POLICY IF EXISTS access_via_schedule_select ON public.schedule_time_ranges;
DROP POLICY IF EXISTS access_via_schedule_insert ON public.schedule_time_ranges;
DROP POLICY IF EXISTS access_via_schedule_update ON public.schedule_time_ranges;
DROP POLICY IF EXISTS access_via_schedule_delete ON public.schedule_time_ranges;
CREATE POLICY auth_all ON public.schedule_time_ranges FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- service_schedules
DROP POLICY IF EXISTS tenant_isolation_select ON public.service_schedules;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.service_schedules;
DROP POLICY IF EXISTS tenant_isolation_update ON public.service_schedules;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.service_schedules;
CREATE POLICY auth_select ON public.service_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.service_schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.service_schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.service_schedules FOR DELETE TO authenticated USING (true);

-- supplies
DROP POLICY IF EXISTS tenant_isolation_select ON public.supplies;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.supplies;
DROP POLICY IF EXISTS tenant_isolation_update ON public.supplies;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.supplies;
CREATE POLICY auth_select ON public.supplies FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.supplies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.supplies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.supplies FOR DELETE TO authenticated USING (true);

-- supply_category_assignments
DROP POLICY IF EXISTS access_via_supply ON public.supply_category_assignments;
CREATE POLICY auth_all ON public.supply_category_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- supply_tag_assignments
DROP POLICY IF EXISTS access_via_supply ON public.supply_tag_assignments;
CREATE POLICY auth_all ON public.supply_tag_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- tenant_branding (preserve anon_branding_select)
DROP POLICY IF EXISTS tenant_select ON public.tenant_branding;
DROP POLICY IF EXISTS tenant_manage ON public.tenant_branding;
DROP POLICY IF EXISTS tenant_update ON public.tenant_branding;
DROP POLICY IF EXISTS tenant_delete ON public.tenant_branding;
CREATE POLICY auth_select ON public.tenant_branding FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.tenant_branding FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.tenant_branding FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.tenant_branding FOR DELETE TO authenticated USING (true);

-- tenants (one tenant only, all authenticated can read it)
DROP POLICY IF EXISTS tenant_select_own ON public.tenants;
CREATE POLICY auth_select ON public.tenants FOR SELECT TO authenticated USING (true);

-- user_permissions
DROP POLICY IF EXISTS tenant_isolation_select ON public.user_permissions;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.user_permissions;
DROP POLICY IF EXISTS tenant_isolation_update ON public.user_permissions;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.user_permissions;
CREATE POLICY auth_select ON public.user_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert ON public.user_permissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update ON public.user_permissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete ON public.user_permissions FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------------
-- STEP 3: Tables with mixed tenant + user-scoped policies
-- Drop the tenant-scoped policies; wrap auth.uid() in the user ones.
-- ---------------------------------------------------------------------

-- notifications: keep own_*, drop tenant_*, add open INSERT (notifyModuleAction
-- needs to insert notifications for OTHER users), add own DELETE.
DROP POLICY IF EXISTS tenant_isolation_select ON public.notifications;
DROP POLICY IF EXISTS tenant_isolation_insert ON public.notifications;
DROP POLICY IF EXISTS tenant_isolation_update ON public.notifications;
DROP POLICY IF EXISTS tenant_isolation_delete ON public.notifications;
ALTER POLICY own_notifications_select ON public.notifications USING (user_id = (SELECT auth.uid()));
ALTER POLICY own_notifications_update ON public.notifications USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS auth_insert_any ON public.notifications;
CREATE POLICY auth_insert_any ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS own_notifications_delete ON public.notifications;
CREATE POLICY own_notifications_delete ON public.notifications FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- profiles: SELECT open to authenticated (other users' display names are needed),
-- UPDATE only own. No INSERT/DELETE policy → only service_role can.
DROP POLICY IF EXISTS profiles_select_own_tenant ON public.profiles;
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);
ALTER POLICY profiles_update_own ON public.profiles USING (id = (SELECT auth.uid()));

-- user_preferences: wrap auth.uid() in (SELECT auth.uid())
ALTER POLICY prefs_select_own ON public.user_preferences USING (user_id = (SELECT auth.uid()));
ALTER POLICY prefs_update_own ON public.user_preferences USING (user_id = (SELECT auth.uid()));
ALTER POLICY prefs_insert_own ON public.user_preferences WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------
-- STEP 4: Verification (must return 0)
-- Postgres normalizes `(SELECT fn())` as `( SELECT fn() AS ...)` with whitespace,
-- so the check uses a regex that tolerates whitespace around SELECT.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM pg_policies
  WHERE schemaname = 'public'
    AND ((qual ~ 'fn_current_tenant_id\(\)' AND qual !~ '\(\s*SELECT[^)]*fn_current_tenant_id')
      OR (with_check ~ 'fn_current_tenant_id\(\)' AND with_check !~ '\(\s*SELECT[^)]*fn_current_tenant_id')
      OR (qual ~ 'auth\.uid\(\)' AND qual !~ '\(\s*SELECT[^)]*auth\.uid')
      OR (with_check ~ 'auth\.uid\(\)' AND with_check !~ '\(\s*SELECT[^)]*auth\.uid'));

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Migration 00031 failed: % policies still have unwrapped fn_current_tenant_id() or auth.uid()', remaining;
  END IF;

  RAISE NOTICE 'Migration 00031 OK: 0 unwrapped tenant/uid references remain.';
END $$;

-- ---------------------------------------------------------------------
-- ROLLBACK (run manually if needed):
--   1. Iterate public._rls_backup_2026_05_06 to recreate original policies.
--   2. Or restore from backup with the snapshot row's qual/with_check.
-- ---------------------------------------------------------------------
