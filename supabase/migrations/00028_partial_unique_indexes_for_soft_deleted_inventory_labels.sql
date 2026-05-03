-- Allow recreating category and tag names after soft-delete.
-- The ERP hides inactive rows, while POI Fact still receives them for sync cleanup.

DROP INDEX IF EXISTS public.idx_product_tags_unique_name;
CREATE UNIQUE INDEX idx_product_tags_unique_name
  ON public.product_tags(tenant_id, category_id, name)
  WHERE is_active = true;

DROP INDEX IF EXISTS public.idx_product_categories_unique_name;
CREATE UNIQUE INDEX idx_product_categories_unique_name
  ON public.product_categories(
    tenant_id,
    name,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_active = true;
