-- Detraccion (SPOT) support for invoices
-- Adds tenant-wide Banco de la Nacion account and per-invoice detraction fields

-- Add detraction account to fact_config (tenant-wide BN account, single per emisor)
ALTER TABLE fact_config
  ADD COLUMN IF NOT EXISTS detraction_account TEXT;

COMMENT ON COLUMN fact_config.detraction_account IS
  'Numero de cuenta del Banco de la Nacion del emisor para depositos de detraccion (SPOT)';

-- Add detraction fields to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS has_detraction BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS detraction_code TEXT,
  ADD COLUMN IF NOT EXISTS detraction_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS detraction_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS detraction_payment_method TEXT DEFAULT '001';

COMMENT ON COLUMN invoices.has_detraction IS 'Operacion sujeta al SPOT (detraccion SUNAT)';
COMMENT ON COLUMN invoices.detraction_code IS 'Codigo del Anexo 3 / Catalogo 54 SUNAT (ej. 022 = Otros servicios empresariales)';
COMMENT ON COLUMN invoices.detraction_percentage IS 'Porcentaje aplicado (ej. 12.00 = 12%)';
COMMENT ON COLUMN invoices.detraction_amount IS 'Monto retenido y depositado en cuenta BN del emisor';
COMMENT ON COLUMN invoices.detraction_payment_method IS 'Codigo medio de pago SUNAT (default 001 = deposito en cuenta)';

CREATE INDEX IF NOT EXISTS idx_invoices_has_detraction
  ON invoices(has_detraction) WHERE has_detraction = true;
