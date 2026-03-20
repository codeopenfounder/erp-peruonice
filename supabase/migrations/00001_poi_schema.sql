-- =====================================================================
-- POI (Peru On Ice) - Complete Database Schema
-- Migration: 00001_poi_schema.sql
-- Date: 2026-03-18
-- Description: Initial schema for POI multi-tenant ERP system
-- =====================================================================

-- ===== 1. EXTENSIONS =====

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" SCHEMA public;

-- ===== 2. ENUMS =====

CREATE TYPE public.notification_type AS ENUM ('info', 'warning', 'success', 'error');

-- ===== 3. TABLES =====

-- ----- tenants -----
CREATE TABLE public.tenants (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text        NOT NULL,
    slug            text        UNIQUE NOT NULL,
    ruc             varchar(11) UNIQUE,
    razon_social    text,
    is_active       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ----- profiles -----
CREATE TABLE public.profiles (
    id                uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    tenant_id         uuid        REFERENCES public.tenants ON DELETE SET NULL,
    email             text        NOT NULL,
    first_name        text        NOT NULL DEFAULT '',
    last_name         text        NOT NULL DEFAULT '',
    full_name         text,
    cargo             text        NOT NULL DEFAULT 'cajero' CHECK (cargo IN ('gerente','supervisor','cajero')),
    avatar_url        text,
    phone             text,
    is_owner          boolean     NOT NULL DEFAULT false,
    is_active         boolean     NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- ----- user_permissions -----
CREATE TABLE public.user_permissions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    module_code     text        NOT NULL,
    can_view        boolean     NOT NULL DEFAULT false,
    can_create      boolean     NOT NULL DEFAULT false,
    can_edit        boolean     NOT NULL DEFAULT false,
    can_delete      boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id, module_code)
);
CREATE INDEX idx_user_permissions_user ON public.user_permissions(user_id);
CREATE INDEX idx_user_permissions_tenant ON public.user_permissions(tenant_id);

-- ----- branches -----
CREATE TABLE public.branches (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code          text NOT NULL,
    name          text NOT NULL,
    type          text NOT NULL DEFAULT 'sucursal' CHECK (type IN ('sede_principal','sucursal','oficina','almacen','planta')),
    is_main       boolean NOT NULL DEFAULT false,
    is_active     boolean NOT NULL DEFAULT true,
    address       text,
    department    text,
    province      text,
    district      text,
    phone         text,
    email         text,
    manager_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    max_capacity  integer,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);
CREATE UNIQUE INDEX idx_branches_tenant_code ON public.branches(tenant_id, code);

-- ----- product_categories -----
CREATE TABLE public.product_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name        text NOT NULL,
    parent_id   uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
    type        text NOT NULL DEFAULT 'both' CHECK (type IN ('product','service','both','supply')),
    is_active   boolean NOT NULL DEFAULT true,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_categories_tenant ON public.product_categories(tenant_id);
CREATE INDEX idx_product_categories_parent ON public.product_categories(parent_id);
CREATE UNIQUE INDEX idx_product_categories_unique_name ON public.product_categories(tenant_id, name, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ----- product_tags -----
CREATE TABLE public.product_tags (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
    name        text NOT NULL,
    color       text,
    is_active   boolean NOT NULL DEFAULT true,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_tags_tenant ON public.product_tags(tenant_id);
CREATE INDEX idx_product_tags_category ON public.product_tags(category_id);
CREATE UNIQUE INDEX idx_product_tags_unique_name ON public.product_tags(tenant_id, category_id, name);

-- ----- products -----
CREATE TABLE public.products (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sku              text NOT NULL,
    name             text NOT NULL,
    description      text,
    type             text NOT NULL CHECK (type IN ('product','service')),
    unit_price       numeric(12,2) NOT NULL DEFAULT 0,
    cost_price       numeric(12,2) DEFAULT 0,
    currency         text NOT NULL DEFAULT 'PEN' CHECK (currency IN ('PEN','USD')),
    tax_type         text NOT NULL DEFAULT 'gravado' CHECK (tax_type IN ('gravado','exonerado','inafecto')),
    igv_rate         numeric(5,2) NOT NULL DEFAULT 18.00,
    stock_quantity   numeric(12,4) NOT NULL DEFAULT 0,
    min_stock        numeric(12,4) DEFAULT 0,
    unit_of_measure  text NOT NULL DEFAULT 'NIU',
    barcode          text,
    image_url        text,
    is_active        boolean NOT NULL DEFAULT true,
    product_kind     text NOT NULL DEFAULT 'simple' CHECK (product_kind IN ('simple','composite')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_stock_non_negative CHECK (stock_quantity >= 0),
    CONSTRAINT products_service_always_simple CHECK (type = 'product' OR product_kind = 'simple')
);
CREATE UNIQUE INDEX idx_products_tenant_sku ON public.products(tenant_id, sku);
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
CREATE INDEX idx_products_type ON public.products(tenant_id, type);
CREATE INDEX idx_products_barcode ON public.products(tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_name ON public.products USING gin (name gin_trgm_ops);

-- ----- product_category_assignments -----
CREATE TABLE public.product_category_assignments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_product_cat_unique ON public.product_category_assignments(product_id, category_id);
CREATE INDEX idx_product_cat_product ON public.product_category_assignments(product_id);
CREATE INDEX idx_product_cat_category ON public.product_category_assignments(category_id);

-- ----- product_tag_assignments -----
CREATE TABLE public.product_tag_assignments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tag_id      uuid NOT NULL REFERENCES public.product_tags(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_product_tag_unique ON public.product_tag_assignments(product_id, tag_id);
CREATE INDEX idx_product_tag_product ON public.product_tag_assignments(product_id);
CREATE INDEX idx_product_tag_tag ON public.product_tag_assignments(tag_id);

-- ----- supplies -----
CREATE TABLE public.supplies (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sku               text NOT NULL,
    name              text NOT NULL,
    description       text,
    unit_of_measure   text NOT NULL DEFAULT 'NIU',
    stock_quantity    numeric(12,4) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    min_stock         numeric(12,4) DEFAULT 0,
    cost_price        numeric(12,2) DEFAULT 0,
    currency          text NOT NULL DEFAULT 'PEN' CHECK (currency IN ('PEN','USD')),
    branch_id         uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    image_url         text,
    barcode           text,
    available_in_pos  boolean NOT NULL DEFAULT false,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_supplies_tenant_sku ON public.supplies(tenant_id, sku);
CREATE INDEX idx_supplies_tenant ON public.supplies(tenant_id);
CREATE INDEX idx_supplies_active ON public.supplies(tenant_id) WHERE is_active = true;
CREATE INDEX idx_supplies_name ON public.supplies USING gin (name gin_trgm_ops);
CREATE INDEX idx_supplies_branch ON public.supplies(branch_id);

-- ----- supply_category_assignments -----
CREATE TABLE public.supply_category_assignments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supply_id   uuid NOT NULL REFERENCES public.supplies(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_supply_cat_unique ON public.supply_category_assignments(supply_id, category_id);
CREATE INDEX idx_supply_cat_supply ON public.supply_category_assignments(supply_id);
CREATE INDEX idx_supply_cat_category ON public.supply_category_assignments(category_id);

-- ----- supply_tag_assignments -----
CREATE TABLE public.supply_tag_assignments (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supply_id uuid NOT NULL REFERENCES public.supplies(id) ON DELETE CASCADE,
    tag_id    uuid NOT NULL REFERENCES public.product_tags(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_supply_tag_unique ON public.supply_tag_assignments(supply_id, tag_id);
CREATE INDEX idx_supply_tag_supply ON public.supply_tag_assignments(supply_id);
CREATE INDEX idx_supply_tag_tag ON public.supply_tag_assignments(tag_id);

-- ----- recipe_items -----
CREATE TABLE public.recipe_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    supply_id       uuid NOT NULL REFERENCES public.supplies(id) ON DELETE RESTRICT,
    quantity_needed numeric(12,4) NOT NULL CHECK (quantity_needed > 0),
    unit_of_measure text NOT NULL DEFAULT 'NIU',
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_recipe_unique ON public.recipe_items(product_id, supply_id);
CREATE INDEX idx_recipe_product ON public.recipe_items(product_id);
CREATE INDEX idx_recipe_supply ON public.recipe_items(supply_id);

-- NOTE: stock_movements table removed — replaced by inventory_movements which covers
-- all movement types (waste, shrinkage, sale, transfer, adjustment, etc.)

-- ----- promotions -----
CREATE TABLE public.promotions (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code                  text NOT NULL,
    name                  text NOT NULL,
    description           text,
    discount_type         text NOT NULL CHECK (discount_type IN ('percentage','fixed_amount','group')),
    discount_value        numeric(12,2),
    applies_to            text NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','products','services')),
    min_purchase_amount   numeric(12,2),
    max_discount_amount   numeric(12,2),
    required_people       integer,
    stock                 integer,
    used_count            integer NOT NULL DEFAULT 0,
    max_uses_per_customer integer,
    valid_from            timestamptz,
    valid_until           timestamptz,
    restricted_hour_from  time,
    restricted_hour_until time,
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_promotions_tenant_code ON public.promotions(tenant_id, code);
CREATE INDEX idx_promotions_tenant ON public.promotions(tenant_id);
CREATE INDEX idx_promotions_active ON public.promotions(tenant_id, is_active);

-- ----- promotion_groups -----
CREATE TABLE public.promotion_groups (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id        uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    name                text NOT NULL,
    required_quantity   integer NOT NULL DEFAULT 2,
    discounted_quantity integer NOT NULL DEFAULT 1,
    discount_percentage numeric(5,2) NOT NULL DEFAULT 100.00,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_promotion_groups_promo ON public.promotion_groups(promotion_id);

-- ----- promotion_category_filters -----
CREATE TABLE public.promotion_category_filters (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    category_id  uuid NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_promo_cat_unique ON public.promotion_category_filters(promotion_id, category_id);

-- ----- promotion_tag_filters -----
CREATE TABLE public.promotion_tag_filters (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    tag_id       uuid NOT NULL REFERENCES public.product_tags(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_promo_tag_unique ON public.promotion_tag_filters(promotion_id, tag_id);

-- ----- promotion_branch_filters -----
CREATE TABLE public.promotion_branch_filters (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    branch_id    uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_promo_branch_unique ON public.promotion_branch_filters(promotion_id, branch_id);

-- ----- promotion_combo_items -----
CREATE TABLE public.promotion_combo_items (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity     integer NOT NULL DEFAULT 1,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_promo_combo_unique ON public.promotion_combo_items(promotion_id, product_id);
CREATE INDEX idx_promo_combo_promotion ON public.promotion_combo_items(promotion_id);

-- ----- customers -----
CREATE TABLE public.customers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    document_type   text NOT NULL CHECK (document_type IN ('ruc','dni','ce','passport','sin_documento')),
    document_number text NOT NULL,
    legal_name      text NOT NULL,
    trade_name      text,
    address         text,
    ubigeo          text,
    email           text,
    phone           text,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_customers_tenant_doc ON public.customers(tenant_id, document_type, document_number);
CREATE INDEX idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX idx_customers_name ON public.customers USING gin (legal_name gin_trgm_ops);

-- ----- cash_registers (created without current_opening_id FK due to circular reference) -----
CREATE TABLE public.cash_registers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id          uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    name               text NOT NULL,
    code               text NOT NULL,
    is_active          boolean NOT NULL DEFAULT true,
    current_opening_id uuid,
    petty_cash_amount  numeric(12,2) NOT NULL DEFAULT 0,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_cash_registers_tenant_code ON public.cash_registers(tenant_id, code);
CREATE INDEX idx_cash_registers_tenant ON public.cash_registers(tenant_id);

-- ----- cash_register_openings -----
CREATE TABLE public.cash_register_openings (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cash_register_id  uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
    opened_by         uuid NOT NULL REFERENCES auth.users(id),
    closed_by         uuid REFERENCES auth.users(id),
    opening_amount    numeric(12,2) NOT NULL DEFAULT 0,
    closing_amount    numeric(12,2),
    expected_amount   numeric(12,2),
    difference        numeric(12,2),
    opened_at         timestamptz NOT NULL DEFAULT now(),
    closed_at         timestamptz,
    status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_openings_register ON public.cash_register_openings(cash_register_id);
CREATE INDEX idx_openings_status ON public.cash_register_openings(cash_register_id, status);

-- Add deferred FK from cash_registers to cash_register_openings (circular reference)
ALTER TABLE public.cash_registers
ADD CONSTRAINT fk_cash_registers_current_opening
FOREIGN KEY (current_opening_id) REFERENCES public.cash_register_openings(id) ON DELETE SET NULL;

-- ----- invoice_series -----
CREATE TABLE public.invoice_series (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    series_code         text NOT NULL,
    document_type       text NOT NULL CHECK (document_type IN ('factura','boleta','nota_credito_factura','nota_credito_boleta','nota_debito_factura','nota_debito_boleta','ticket')),
    current_correlative integer NOT NULL DEFAULT 0,
    branch_id           uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    cash_register_id    uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_invoice_series_tenant_code ON public.invoice_series(tenant_id, series_code);
CREATE INDEX idx_invoice_series_tenant ON public.invoice_series(tenant_id);

-- ----- invoices -----
CREATE TABLE public.invoices (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    series_id            uuid NOT NULL REFERENCES public.invoice_series(id),
    correlative_number   integer NOT NULL,
    document_type        text NOT NULL CHECK (document_type IN ('factura','boleta','nota_credito','nota_debito','ticket')),
    customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    issue_date           date NOT NULL DEFAULT CURRENT_DATE,
    due_date             date,
    currency             text NOT NULL DEFAULT 'PEN' CHECK (currency IN ('PEN','USD')),
    exchange_rate        numeric(8,4) DEFAULT 1.0000,
    op_gravada           numeric(12,2) NOT NULL DEFAULT 0,
    op_exonerada         numeric(12,2) NOT NULL DEFAULT 0,
    op_inafecta          numeric(12,2) NOT NULL DEFAULT 0,
    igv_total            numeric(12,2) NOT NULL DEFAULT 0,
    isc_total            numeric(12,2) NOT NULL DEFAULT 0,
    icbper_total         numeric(12,2) NOT NULL DEFAULT 0,
    discount_total       numeric(12,2) NOT NULL DEFAULT 0,
    total                numeric(12,2) NOT NULL DEFAULT 0,
    status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','sent_to_sunat','accepted','rejected','voided','pending_void')),
    sunat_document_id    text,
    sunat_response_code  text,
    sunat_response_desc  text,
    sunat_ticket         text,
    xml_url              text,
    pdf_url              text,
    cdr_url              text,
    hash_code            text,
    qr_data              text,
    notes                text,
    cash_register_id     uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
    opening_id           uuid REFERENCES public.cash_register_openings(id) ON DELETE SET NULL,
    cashier_id           uuid REFERENCES auth.users(id),
    payment_method       text CHECK (payment_method IN ('cash','card','transfer','credit','mixed')),
    payment_terms        text,
    reference_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    reference_reason     text,
    promotion_id         uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
    promotion_discount   numeric(12,2) DEFAULT 0,
    promotion_uses       integer NOT NULL DEFAULT 0,
    created_by           uuid REFERENCES auth.users(id),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invoices_total_non_negative CHECK (total >= 0)
);
CREATE UNIQUE INDEX idx_invoices_tenant_series_corr ON public.invoices(tenant_id, series_id, correlative_number);
CREATE INDEX idx_invoices_tenant ON public.invoices(tenant_id);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX idx_invoices_date ON public.invoices(tenant_id, issue_date);
CREATE INDEX idx_invoices_status ON public.invoices(tenant_id, status);

-- ----- invoice_items -----
CREATE TABLE public.invoice_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id          uuid REFERENCES public.products(id) ON DELETE SET NULL,
    supply_id           uuid REFERENCES public.supplies(id) ON DELETE SET NULL,
    description         text NOT NULL,
    quantity            numeric(12,4) NOT NULL DEFAULT 1,
    unit_price          numeric(12,4) NOT NULL,
    unit_of_measure     text NOT NULL DEFAULT 'NIU',
    discount_percentage numeric(5,2) DEFAULT 0,
    discount_amount     numeric(12,2) DEFAULT 0,
    tax_type            text NOT NULL DEFAULT 'gravado' CHECK (tax_type IN ('gravado','exonerado','inafecto')),
    igv_rate            numeric(5,2) NOT NULL DEFAULT 18.00,
    igv_amount          numeric(12,2) NOT NULL DEFAULT 0,
    isc_rate            numeric(5,2) DEFAULT 0,
    isc_amount          numeric(12,2) DEFAULT 0,
    icbper_amount       numeric(12,2) DEFAULT 0,
    subtotal            numeric(12,2) NOT NULL DEFAULT 0,
    total               numeric(12,2) NOT NULL DEFAULT 0,
    is_cortesia         boolean NOT NULL DEFAULT false,
    cortesia_reason     text CHECK (is_cortesia = false OR cortesia_reason IN ('cliente_insatisfecho','falla_producto','autorizacion_gerencia','otro')),
    original_unit_price numeric(12,4),
    sort_order          integer NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_supply ON public.invoice_items(supply_id);

-- ----- cash_register_movements -----
CREATE TABLE public.cash_register_movements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    opening_id      uuid NOT NULL REFERENCES public.cash_register_openings(id) ON DELETE CASCADE,
    type            text NOT NULL CHECK (type IN ('sale','cash_in','cash_out','refund','petty_cash_in')),
    amount          numeric(12,2) NOT NULL,
    description     text,
    reason          text,
    receipt_number  text,
    invoice_id      uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    payment_method  text CHECK (payment_method IN ('cash','card','transfer','mixed')),
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_opening ON public.cash_register_movements(opening_id);
CREATE INDEX idx_movements_tenant ON public.cash_register_movements(tenant_id);

-- ----- promotion_usage -----
CREATE TABLE public.promotion_usage (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    customer_id  uuid,
    invoice_id   uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    used_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_promotion_usage_promo ON public.promotion_usage(promotion_id);
CREATE INDEX idx_promotion_usage_customer ON public.promotion_usage(promotion_id, customer_id);

-- ----- inventory_movements -----
CREATE TABLE public.inventory_movements (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entity_type    text NOT NULL CHECK (entity_type IN ('product','supply')),
    entity_id      uuid NOT NULL,
    quantity       numeric(12,4) NOT NULL CHECK (quantity > 0),
    movement_type  text NOT NULL CHECK (movement_type IN ('waste','shrinkage','staff_consumption','breakage','adjustment','transfer','income','outcome','sale')),
    reason         text,
    notes          text,
    branch_id      uuid NOT NULL REFERENCES public.branches(id) ON DELETE SET NULL,
    supplier_ruc   text,
    invoice_code   text,
    invoice_id     uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
    created_by     uuid REFERENCES auth.users(id),
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_mov_tenant ON public.inventory_movements(tenant_id);
CREATE INDEX idx_inv_mov_entity ON public.inventory_movements(entity_type, entity_id);
CREATE INDEX idx_inv_mov_type ON public.inventory_movements(tenant_id, movement_type);
CREATE INDEX idx_inv_mov_date ON public.inventory_movements(created_at);
CREATE INDEX idx_inv_mov_invoice ON public.inventory_movements(invoice_id);

-- ----- inventory_audits -----
CREATE TABLE public.inventory_audits (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id               uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    status                  text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    items_audited           integer NOT NULL DEFAULT 0,
    items_adjusted          integer NOT NULL DEFAULT 0,
    total_discrepancy_value numeric(12,2) NOT NULL DEFAULT 0,
    audited_by              uuid NOT NULL REFERENCES auth.users(id),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    decided_at              timestamptz
);
CREATE INDEX idx_audits_tenant ON public.inventory_audits(tenant_id);
CREATE INDEX idx_audits_branch ON public.inventory_audits(branch_id);
CREATE INDEX idx_audits_status ON public.inventory_audits(tenant_id, status);
CREATE INDEX idx_audits_date ON public.inventory_audits(created_at);

-- ----- inventory_audit_items -----
CREATE TABLE public.inventory_audit_items (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id          uuid NOT NULL REFERENCES public.inventory_audits(id) ON DELETE CASCADE,
    entity_type       text NOT NULL CHECK (entity_type IN ('product','supply')),
    entity_id         uuid NOT NULL,
    entity_name       text NOT NULL,
    entity_sku        text NOT NULL,
    cost_price        numeric(12,2) NOT NULL DEFAULT 0,
    theoretical_stock numeric(12,4) NOT NULL,
    physical_stock    numeric(12,4) NOT NULL,
    difference        numeric(12,4) NOT NULL,
    cost_impact       numeric(12,2) NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_items_audit ON public.inventory_audit_items(audit_id);
CREATE INDEX idx_audit_items_entity ON public.inventory_audit_items(entity_type, entity_id);

-- ----- fact_config -----
CREATE TABLE public.fact_config (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider         text NOT NULL DEFAULT 'apisunat' CHECK (provider IN ('apisunat','nubefact','efact')),
    api_token        text,
    ruc              text NOT NULL,
    razon_social     text NOT NULL,
    direccion_fiscal text,
    ubigeo           text,
    departamento     text,
    provincia        text,
    distrito         text,
    logo_url         text,
    is_production    boolean NOT NULL DEFAULT false,
    is_active        boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ----- fact_user_assignments -----
CREATE TABLE public.fact_user_assignments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cash_register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
    pin_code         text,
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_fact_users_tenant_user ON public.fact_user_assignments(tenant_id, user_id);
CREATE INDEX idx_fact_users_tenant ON public.fact_user_assignments(tenant_id);

-- ----- notifications -----
CREATE TABLE public.notifications (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type            public.notification_type NOT NULL DEFAULT 'info',
    title           text        NOT NULL,
    message         text,
    resource_type   text,
    resource_id     uuid,
    is_read         boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX idx_notifications_tenant_id ON public.notifications(tenant_id);

-- ----- audit_log -----
CREATE TABLE public.audit_log (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid        REFERENCES public.tenants(id) ON DELETE SET NULL,
    user_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    action      text        NOT NULL,
    resource    text        NOT NULL,
    resource_id uuid,
    old_data    jsonb,
    new_data    jsonb,
    ip_address  inet,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_tenant_created ON public.audit_log(tenant_id, created_at);
CREATE INDEX idx_audit_log_user_id ON public.audit_log(user_id);

-- ----- tenant_branding -----
CREATE TABLE public.tenant_branding (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    company_name    text,
    logo_url        text,
    primary_color   text DEFAULT '#DC2626',
    secondary_color text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ----- user_preferences -----
CREATE TABLE public.user_preferences (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    theme           text NOT NULL DEFAULT 'dark',
    font_size       text NOT NULL DEFAULT 'md',
    locale          text NOT NULL DEFAULT 'es',
    push_enabled    boolean NOT NULL DEFAULT false,
    quick_access    text[] DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_user_preferences_user ON public.user_preferences(user_id, tenant_id);

-- ===== 4. FUNCTIONS =====

-- ----- fn_update_timestamp -----
CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ----- fn_handle_new_user -----
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
    );
    RETURN NEW;
END;
$$;

-- ----- fn_create_notification -----
CREATE OR REPLACE FUNCTION public.fn_create_notification(
    p_tenant_id uuid, p_user_id uuid, p_type public.notification_type,
    p_title text, p_message text, p_resource_type text DEFAULT NULL, p_resource_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.notifications (tenant_id, user_id, type, title, message, resource_type, resource_id)
    VALUES (p_tenant_id, p_user_id, p_type, p_title, p_message, p_resource_type, p_resource_id)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ----- fn_generate_branch_code -----
CREATE OR REPLACE FUNCTION public.fn_generate_branch_code(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)), 0) + 1 INTO next_num
    FROM public.branches WHERE tenant_id = p_tenant_id;
  RETURN 'BRN-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- ----- fn_generate_product_sku -----
CREATE OR REPLACE FUNCTION public.fn_generate_product_sku(p_tenant_id UUID, p_type TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num INTEGER; prefix TEXT;
BEGIN
  prefix := CASE WHEN p_type = 'service' THEN 'SRV' ELSE 'PRD' END;
  SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM 5) AS INTEGER)), 0) + 1 INTO next_num
    FROM public.products WHERE tenant_id = p_tenant_id AND sku LIKE prefix || '-%';
  RETURN prefix || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;

-- ----- fn_generate_product_barcode -----
CREATE OR REPLACE FUNCTION public.fn_generate_product_barcode(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num BIGINT;
BEGIN
  SELECT COALESCE(MAX(CAST(barcode AS BIGINT)), 200000000000) + 1 INTO next_num
    FROM public.products WHERE tenant_id = p_tenant_id AND barcode ~ '^\d{12}$';
  RETURN LPAD(next_num::TEXT, 12, '0');
END;
$$;

-- ----- fn_generate_supply_sku -----
CREATE OR REPLACE FUNCTION public.fn_generate_supply_sku(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM 5) AS INTEGER)), 0) + 1 INTO next_num
    FROM public.supplies WHERE tenant_id = p_tenant_id AND sku LIKE 'INS-%';
  RETURN 'INS-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;

-- ----- fn_generate_cash_register_code -----
CREATE OR REPLACE FUNCTION public.fn_generate_cash_register_code(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 6) AS INTEGER)), 0) + 1 INTO next_num
    FROM public.cash_registers WHERE tenant_id = p_tenant_id;
  RETURN 'CAJA-' || LPAD(next_num::TEXT, 2, '0');
END;
$$;

-- ----- fn_next_correlative -----
CREATE OR REPLACE FUNCTION public.fn_next_correlative(p_series_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE next_val INTEGER;
BEGIN
  UPDATE public.invoice_series SET current_correlative = current_correlative + 1
  WHERE id = p_series_id RETURNING current_correlative INTO next_val;
  RETURN next_val;
END;
$$;

-- ----- fn_calculate_composite_stock -----
CREATE OR REPLACE FUNCTION public.fn_calculate_composite_stock(p_product_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_min_producible INT := 2147483647; v_possible INT; r RECORD;
BEGIN
  FOR r IN SELECT ri.quantity_needed, s.stock_quantity FROM public.recipe_items ri
    JOIN public.supplies s ON ri.supply_id = s.id WHERE ri.product_id = p_product_id
  LOOP
    IF r.quantity_needed > 0 THEN
      v_possible := FLOOR(r.stock_quantity / r.quantity_needed);
      v_min_producible := LEAST(v_min_producible, v_possible);
    END IF;
  END LOOP;
  IF v_min_producible = 2147483647 THEN RETURN 0; END IF;
  RETURN v_min_producible;
END;
$$;

-- ----- fn_decrement_composite_stock -----
CREATE OR REPLACE FUNCTION public.fn_decrement_composite_stock(p_product_id UUID, p_quantity INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.supplies s
  SET stock_quantity = GREATEST(s.stock_quantity - (ri.quantity_needed * p_quantity), 0), updated_at = NOW()
  FROM public.recipe_items ri WHERE ri.product_id = p_product_id AND ri.supply_id = s.id;
END;
$$;

-- ----- fn_decrement_stock -----
CREATE OR REPLACE FUNCTION public.fn_decrement_stock(p_product_id UUID, p_quantity NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_kind TEXT; v_remaining NUMERIC;
BEGIN
  SELECT product_kind INTO v_kind FROM public.products WHERE id = p_product_id;
  IF v_kind = 'composite' THEN
    PERFORM fn_decrement_composite_stock(p_product_id, p_quantity::INT);
    v_remaining := fn_calculate_composite_stock(p_product_id);
    UPDATE public.products SET stock_quantity = v_remaining, updated_at = NOW() WHERE id = p_product_id;
  ELSE
    UPDATE public.products SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0), updated_at = NOW()
    WHERE id = p_product_id AND type = 'product';
    SELECT stock_quantity INTO v_remaining FROM public.products WHERE id = p_product_id;
  END IF;
  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- ----- fn_increment_stock -----
CREATE OR REPLACE FUNCTION public.fn_increment_stock(p_product_id UUID, p_quantity NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_kind TEXT; v_remaining NUMERIC;
BEGIN
  SELECT product_kind INTO v_kind FROM public.products WHERE id = p_product_id;
  IF v_kind = 'composite' THEN
    UPDATE public.supplies s SET stock_quantity = s.stock_quantity + (ri.quantity_needed * p_quantity), updated_at = NOW()
    FROM public.recipe_items ri WHERE ri.product_id = p_product_id AND ri.supply_id = s.id;
    v_remaining := fn_calculate_composite_stock(p_product_id);
    UPDATE public.products SET stock_quantity = v_remaining, updated_at = NOW() WHERE id = p_product_id;
  ELSE
    UPDATE public.products SET stock_quantity = stock_quantity + p_quantity, updated_at = NOW()
    WHERE id = p_product_id AND type = 'product';
    SELECT stock_quantity INTO v_remaining FROM public.products WHERE id = p_product_id;
  END IF;
  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- ----- fn_decrement_supply_stock -----
CREATE OR REPLACE FUNCTION public.fn_decrement_supply_stock(p_supply_id UUID, p_quantity NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_remaining NUMERIC;
BEGIN
  UPDATE public.supplies SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0), updated_at = NOW() WHERE id = p_supply_id;
  SELECT stock_quantity INTO v_remaining FROM public.supplies WHERE id = p_supply_id;
  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- ----- fn_increment_supply_stock -----
CREATE OR REPLACE FUNCTION public.fn_increment_supply_stock(p_supply_id UUID, p_quantity NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_remaining NUMERIC;
BEGIN
  UPDATE public.supplies SET stock_quantity = stock_quantity + p_quantity, updated_at = NOW() WHERE id = p_supply_id;
  SELECT stock_quantity INTO v_remaining FROM public.supplies WHERE id = p_supply_id;
  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- ----- fn_refresh_composite_stock_for_supply -----
CREATE OR REPLACE FUNCTION public.fn_refresh_composite_stock_for_supply(p_supply_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT DISTINCT ri.product_id FROM public.recipe_items ri WHERE ri.supply_id = p_supply_id
  LOOP
    UPDATE public.products SET stock_quantity = fn_calculate_composite_stock(rec.product_id), updated_at = NOW()
    WHERE id = rec.product_id AND product_kind = 'composite';
  END LOOP;
END;
$$;

-- ----- fn_check_low_stock -----
CREATE OR REPLACE FUNCTION public.fn_check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.min_stock IS NOT NULL
     AND NEW.stock_quantity <= NEW.min_stock
     AND NEW.stock_quantity < OLD.stock_quantity
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE resource_type = TG_ARGV[0]
        AND resource_id = NEW.id
        AND type = 'warning'
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    ) THEN
      INSERT INTO public.notifications (tenant_id, user_id, type, title, message, resource_type, resource_id)
      SELECT NEW.tenant_id, p.id, 'warning',
        CASE WHEN NEW.stock_quantity = 0
          THEN 'Sin stock — ' || NEW.name
          ELSE 'Stock bajo — ' || NEW.name
        END,
        'El ' || TG_ARGV[0] || ' "' || NEW.name || '" tiene ' || NEW.stock_quantity || ' unidades (minimo: ' || NEW.min_stock || ')',
        TG_ARGV[0], NEW.id
      FROM public.profiles p
      WHERE p.tenant_id = NEW.tenant_id AND p.is_active = true AND p.is_owner = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----- fn_current_tenant_id (RLS helper) -----
CREATE OR REPLACE FUNCTION public.fn_current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ===== 5. TRIGGERS =====

-- updated_at triggers
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_user_permissions_updated BEFORE UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_product_categories_updated BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_supplies_updated BEFORE UPDATE ON public.supplies FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_promotions_updated BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_cash_registers_updated BEFORE UPDATE ON public.cash_registers FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_fact_config_updated BEFORE UPDATE ON public.fact_config FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_tenant_branding_updated BEFORE UPDATE ON public.tenant_branding FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_user_preferences_updated BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- Auth trigger for new users
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fn_handle_new_user();

-- Low stock triggers
CREATE TRIGGER trg_products_low_stock AFTER UPDATE OF stock_quantity ON public.products FOR EACH ROW EXECUTE FUNCTION fn_check_low_stock('producto');
CREATE TRIGGER trg_supplies_low_stock AFTER UPDATE OF stock_quantity ON public.supplies FOR EACH ROW EXECUTE FUNCTION fn_check_low_stock('insumo');

-- ===== 6. ROW LEVEL SECURITY =====

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_category_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_category_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_branch_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_category_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_tag_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_user_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ----- tenants: users can only see their own tenant -----
CREATE POLICY "tenant_select_own" ON public.tenants FOR SELECT TO authenticated
  USING (id = fn_current_tenant_id());

-- ----- profiles: see own tenant, update only own -----
CREATE POLICY "profiles_select_own_tenant" ON public.profiles FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- ----- user_permissions -----
CREATE POLICY "tenant_isolation_select" ON public.user_permissions FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.user_permissions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.user_permissions FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.user_permissions FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- branches -----
CREATE POLICY "tenant_isolation_select" ON public.branches FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.branches FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.branches FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.branches FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- product_categories -----
CREATE POLICY "tenant_isolation_select" ON public.product_categories FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.product_categories FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.product_categories FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.product_categories FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- product_tags -----
CREATE POLICY "tenant_isolation_select" ON public.product_tags FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.product_tags FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.product_tags FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.product_tags FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- products -----
CREATE POLICY "tenant_isolation_select" ON public.products FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.products FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.products FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- supplies -----
CREATE POLICY "tenant_isolation_select" ON public.supplies FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.supplies FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.supplies FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.supplies FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- promotions -----
CREATE POLICY "tenant_isolation_select" ON public.promotions FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.promotions FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.promotions FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- promotion_usage -----
CREATE POLICY "tenant_isolation_select" ON public.promotion_usage FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.promotion_usage FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.promotion_usage FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.promotion_usage FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- customers -----
CREATE POLICY "tenant_isolation_select" ON public.customers FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.customers FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.customers FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- cash_registers -----
CREATE POLICY "tenant_isolation_select" ON public.cash_registers FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.cash_registers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.cash_registers FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.cash_registers FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- cash_register_openings -----
CREATE POLICY "tenant_isolation_select" ON public.cash_register_openings FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.cash_register_openings FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.cash_register_openings FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.cash_register_openings FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- cash_register_movements -----
CREATE POLICY "tenant_isolation_select" ON public.cash_register_movements FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.cash_register_movements FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.cash_register_movements FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.cash_register_movements FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- invoice_series -----
CREATE POLICY "tenant_isolation_select" ON public.invoice_series FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.invoice_series FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.invoice_series FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.invoice_series FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- invoices -----
CREATE POLICY "tenant_isolation_select" ON public.invoices FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.invoices FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.invoices FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- inventory_movements -----
CREATE POLICY "tenant_isolation_select" ON public.inventory_movements FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.inventory_movements FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.inventory_movements FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- inventory_audits -----
CREATE POLICY "tenant_isolation_select" ON public.inventory_audits FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.inventory_audits FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.inventory_audits FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.inventory_audits FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- fact_config -----
CREATE POLICY "tenant_isolation_select" ON public.fact_config FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.fact_config FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.fact_config FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.fact_config FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "anon_fact_config_select" ON public.fact_config FOR SELECT TO anon USING (true);

-- ----- fact_user_assignments -----
CREATE POLICY "tenant_isolation_select" ON public.fact_user_assignments FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.fact_user_assignments FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.fact_user_assignments FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.fact_user_assignments FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "anon_fact_users_select" ON public.fact_user_assignments FOR SELECT TO anon USING (true);

-- ----- notifications: tenant isolation + own notifications -----
CREATE POLICY "tenant_isolation_select" ON public.notifications FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_update" ON public.notifications FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_isolation_delete" ON public.notifications FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "own_notifications_select" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own_notifications_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ----- audit_log: tenant read only -----
CREATE POLICY "tenant_read_audit" ON public.audit_log FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());

-- ----- Junction tables: access via parent entity -----

-- product_category_assignments
CREATE POLICY "access_via_product" ON public.product_category_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.tenant_id = fn_current_tenant_id()));

-- product_tag_assignments
CREATE POLICY "access_via_product" ON public.product_tag_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.tenant_id = fn_current_tenant_id()));

-- supply_category_assignments
CREATE POLICY "access_via_supply" ON public.supply_category_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplies s WHERE s.id = supply_id AND s.tenant_id = fn_current_tenant_id()));

-- supply_tag_assignments
CREATE POLICY "access_via_supply" ON public.supply_tag_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplies s WHERE s.id = supply_id AND s.tenant_id = fn_current_tenant_id()));

-- recipe_items
CREATE POLICY "access_via_product" ON public.recipe_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.tenant_id = fn_current_tenant_id()));

-- promotion_groups
CREATE POLICY "access_via_promotion" ON public.promotion_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_id AND p.tenant_id = fn_current_tenant_id()));

-- promotion_category_filters
CREATE POLICY "access_via_promotion" ON public.promotion_category_filters FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_id AND p.tenant_id = fn_current_tenant_id()));

-- promotion_tag_filters
CREATE POLICY "access_via_promotion" ON public.promotion_tag_filters FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_id AND p.tenant_id = fn_current_tenant_id()));

-- promotion_branch_filters
CREATE POLICY "access_via_promotion" ON public.promotion_branch_filters FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_id AND p.tenant_id = fn_current_tenant_id()));

-- promotion_combo_items
CREATE POLICY "access_via_promotion" ON public.promotion_combo_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_id AND p.tenant_id = fn_current_tenant_id()));

-- tenant_branding
CREATE POLICY "tenant_select" ON public.tenant_branding FOR SELECT TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_manage" ON public.tenant_branding FOR INSERT TO authenticated
  WITH CHECK (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_update" ON public.tenant_branding FOR UPDATE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "tenant_delete" ON public.tenant_branding FOR DELETE TO authenticated
  USING (tenant_id = fn_current_tenant_id());
CREATE POLICY "anon_branding_select" ON public.tenant_branding FOR SELECT TO anon USING (true);

-- user_preferences
CREATE POLICY "own_preferences_select" ON public.user_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own_preferences_insert" ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_preferences_update" ON public.user_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own_preferences_delete" ON public.user_preferences FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- invoice_items
CREATE POLICY "access_via_invoice" ON public.invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.tenant_id = fn_current_tenant_id()));

-- inventory_audit_items
CREATE POLICY "access_via_audit" ON public.inventory_audit_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventory_audits a WHERE a.id = audit_id AND a.tenant_id = fn_current_tenant_id()));

-- ===== 7. STORAGE BUCKETS =====

INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('supply-images', 'supply-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies: product-images
CREATE POLICY "public_read_product_images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'product-images');
CREATE POLICY "authenticated_upload_product_images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "authenticated_update_product_images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "authenticated_delete_product_images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');

-- Storage policies: supply-images
CREATE POLICY "public_read_supply_images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'supply-images');
CREATE POLICY "authenticated_upload_supply_images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'supply-images');
CREATE POLICY "authenticated_update_supply_images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'supply-images');
CREATE POLICY "authenticated_delete_supply_images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'supply-images');

-- Storage policies: logos
CREATE POLICY "public_read_logos" ON storage.objects FOR SELECT TO public USING (bucket_id = 'logos');
CREATE POLICY "authenticated_upload_logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos');
