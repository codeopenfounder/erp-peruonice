-- 00014_add_nc_return_movement_type.sql
-- Fix: inventory_movements CHECK constraint missing 'nc_return' type
-- NC devoluciones (motivos 01, 06, 07) insert movement_type = 'nc_return'
-- which was silently rejected by the old constraint

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('waste','shrinkage','staff_consumption','breakage','adjustment','transfer','income','outcome','sale','nc_return'));
