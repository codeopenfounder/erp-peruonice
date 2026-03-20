-- ============================================================================
-- Migration 00005: Fix promotions schema — add missing columns, remove unused
-- ============================================================================

-- Add columns that the code references but the DB doesn't have
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS is_combo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS combo_price NUMERIC(12,2);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_quantity INTEGER;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS applies_every INTEGER NOT NULL DEFAULT 0;

-- Remove unused column (not referenced in any code file)
ALTER TABLE promotions DROP COLUMN IF EXISTS required_people;

-- Fix discount_type constraint to include 'group' (referenced in code)
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_discount_type_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_discount_type_check
CHECK (discount_type = ANY (ARRAY['percentage','fixed_amount','group']));
