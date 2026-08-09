-- Migración 00039: correlativo diario y registro de los resúmenes SUNAT (RC/RA)
-- Idempotente: re-ejecutable sin error.
--
-- El problema que resuelve
-- ------------------------
-- Un "resumen" de SUNAT (RC = resumen diario de boletas, RA = comunicación de
-- baja) se identifica por `RC-AAAAMMDD-N` / `RA-AAAAMMDD-N`, donde N es un
-- correlativo propio y creciente DENTRO de ese día. Billme no lo genera: lo
-- recibe en el payload de POST /Emission/EnviarResumen y lo respeta.
--
-- El adapter mandaba `correlativo: "1"` fijo (bilme-adapter.ts). Con una sola
-- baja al día funcionaba por accidente; la segunda del mismo día reutiliza el
-- identificador del primer resumen.
--
-- Además, un resumen no responde de forma síncrona: devuelve un TICKET que hay
-- que consultar aparte con ConsultarEstadoTicket. Ese ticket se estaba
-- descartando en el único sitio que llama a void() (`/api/fact/sunat`), así que
-- no había forma de saber después si SUNAT aceptó la baja.
--
-- El correlativo NO puede colgar de invoice_series: el CHECK de su document_type
-- (00001:377) sólo admite tipos de comprobante, y un resumen no lo es.

-- ---------------------------------------------------------------------------
-- 1. Tabla de resúmenes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sunat_summaries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    summary_type    text NOT NULL CHECK (summary_type IN ('RC', 'RA')),
    -- Fecha de EMISIÓN de los documentos que informa, no la del envío. Es la que
    -- forma el identificador del resumen y la que SUNAT valida contra el plazo.
    reference_date  date NOT NULL,
    correlative     integer NOT NULL,
    sent_at         timestamptz NOT NULL DEFAULT now(),
    ticket          text,
    -- pending: enviado, ticket sin consultar. accepted/rejected: ya consultado.
    -- failed: ni siquiera se pudo enviar.
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected', 'failed')),
    response_code   text,
    response_desc   text,
    xml_url         text,
    cdr_url         text,
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- El identificador del resumen tiene que ser único: reenviar RA-20260808-1 con
-- distinto contenido es exactamente el fallo que esta migración evita.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sunat_summaries_identity
  ON public.sunat_summaries (tenant_id, summary_type, reference_date, correlative);

CREATE INDEX IF NOT EXISTS idx_sunat_summaries_pending
  ON public.sunat_summaries (tenant_id, sent_at)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_sunat_summaries_updated ON public.sunat_summaries;
CREATE TRIGGER trg_sunat_summaries_updated
  BEFORE UPDATE ON public.sunat_summaries
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ---------------------------------------------------------------------------
-- 2. Correlativo diario atómico
-- ---------------------------------------------------------------------------
-- Mismo patrón que fn_next_correlative: el valor sale de un UPDATE, así que el
-- bloqueo de fila serializa a los concurrentes. La diferencia es que aquí la
-- "fila" puede no existir todavía (primer resumen del día), de ahí el INSERT ...
-- ON CONFLICT DO UPDATE, que es atómico en una sola sentencia.
CREATE TABLE IF NOT EXISTS public.sunat_summary_counters (
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    summary_type    text NOT NULL CHECK (summary_type IN ('RC', 'RA')),
    reference_date  date NOT NULL,
    last_correlative integer NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, summary_type, reference_date)
);

CREATE OR REPLACE FUNCTION public.fn_next_summary_correlative(
    p_tenant_id UUID,
    p_summary_type TEXT,
    p_reference_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_next INTEGER;
BEGIN
  INSERT INTO public.sunat_summary_counters
    (tenant_id, summary_type, reference_date, last_correlative)
  VALUES (p_tenant_id, p_summary_type, p_reference_date, 1)
  ON CONFLICT (tenant_id, summary_type, reference_date)
  DO UPDATE SET last_correlative = public.sunat_summary_counters.last_correlative + 1
  RETURNING last_correlative INTO v_next;
  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.fn_next_summary_correlative IS
  'Correlativo del resumen SUNAT (RC/RA) dentro de una fecha de referencia. Atómico.';

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
-- Mismo criterio que 00031: RLS activa para bloquear tráfico anónimo, sin filtro
-- por tenant en la policy (el aislamiento lo hace el código de aplicación).
ALTER TABLE public.sunat_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sunat_summary_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_sunat_summaries" ON public.sunat_summaries;
CREATE POLICY "authenticated_all_sunat_summaries"
  ON public.sunat_summaries FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_sunat_summary_counters" ON public.sunat_summary_counters;
CREATE POLICY "authenticated_all_sunat_summary_counters"
  ON public.sunat_summary_counters FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
