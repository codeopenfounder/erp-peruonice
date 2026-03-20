-- =====================================================================
-- Migration 00004: Generated full_name + unused table cleanup
-- Date: 2026-03-18
-- Description:
--   1. Document profiles.full_name as GENERATED ALWAYS (already applied in DB)
--   2. Drop unused tables: visitor_attendance, promotion_groups
-- =====================================================================

-- ===== 1. GENERATED COLUMN (idempotent — already applied via dashboard) =====
-- profiles.full_name is now GENERATED ALWAYS AS (TRIM(first_name || ' ' || last_name)) STORED
-- This was applied directly to the database. This migration documents it.
-- If running on a fresh DB, the column would be recreated by 00001 as regular text,
-- and this ALTER converts it to generated:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name = 'full_name' AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS full_name;
    ALTER TABLE public.profiles ADD COLUMN full_name text GENERATED ALWAYS AS (
      TRIM(BOTH FROM (first_name || ' ' || last_name))
    ) STORED;
  END IF;
END $$;

-- ===== 2. DROP UNUSED TABLES =====

-- visitor_attendance: Created "for future use" in 00002_kpi_tables.sql
-- Zero code references in poi-erp or kronos-fact. 0 rows.
DROP TABLE IF EXISTS public.visitor_attendance;

-- promotion_groups: Legacy design superseded by promotion_combo_items (00003).
-- Zero code references. 0 rows. promotion_combo_items covers the combo use case.
DROP TABLE IF EXISTS public.promotion_groups;
