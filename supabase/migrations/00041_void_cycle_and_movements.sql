-- Migración 00041: cierre del ciclo asíncrono de anulación y trazabilidad de movimientos
-- Idempotente: re-ejecutable sin error.
--
-- Contexto
-- --------
-- La migración 00039 creó `sunat_summaries` para dejar de reutilizar el
-- identificador `RA-AAAAMMDD-1` en cada baja del día, y guardó el ticket que
-- devuelve SUNAT. Lo que faltaba era el otro extremo del ciclo: **nadie consulta
-- ese ticket**, así que `sunat_summaries.status` se queda en `pending` para
-- siempre y el comprobante se marca `voided` con un simple acuse de recepción.
--
-- Un resumen (RC de boletas, RA de bajas) es asíncrono por diseño: `EnviarResumen`
-- responde con un ticket y la validación real llega después, consultando
-- `ConsultarEstadoTicket`. Los códigos son los de SUNAT: 0 procesado (trae el CDR),
-- 98 en proceso, 99 procesado con errores.
--
-- Esta migración aporta las tres piezas de esquema que el polling necesita y
-- corrige una contradicción vieja en `inventory_movements`.

-- ---------------------------------------------------------------------------
-- 1. Qué comprobantes cubre cada resumen
-- ---------------------------------------------------------------------------
-- `sunat_summaries` guarda la identidad del resumen y su ticket, pero NO a qué
-- comprobante pertenece la baja. Sin ese enlace, cuando el ticket se resuelve no
-- hay forma de saber qué fila de `invoices` marcar: el resumen y el comprobante
-- quedan como dos hechos sin relación.
--
-- Tabla y no columna: un RA lleva hoy un solo documento, pero el RC (resumen
-- diario) lleva todas las boletas de la jornada y el ítem en estado 3 es
-- precisamente cómo se anula una boleta. Modelarlo 1:N desde el principio evita
-- rehacerlo el día que se construya el RC.
CREATE TABLE IF NOT EXISTS public.sunat_summary_items (
    summary_id  uuid NOT NULL REFERENCES public.sunat_summaries(id) ON DELETE CASCADE,
    invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (summary_id, invoice_id)
);

COMMENT ON TABLE public.sunat_summary_items IS
  'Comprobantes informados en un resumen SUNAT (RC/RA). El polling del ticket resuelve el estado de estas filas.';

-- El polling recorre resúmenes → comprobantes; la UI del ERP recorre
-- comprobante → resumen ("¿en qué resumen viajó esta anulación?").
CREATE INDEX IF NOT EXISTS idx_sunat_summary_items_invoice
  ON public.sunat_summary_items (invoice_id);

-- ---------------------------------------------------------------------------
-- 2. Tope de consultas del ticket
-- ---------------------------------------------------------------------------
-- El único reloj disponible es el pull del POS, cada 2 minutos: no hay cron en
-- Vercel. Sin tope, un ticket que SUNAT nunca resuelve —o uno de un resumen que
-- ni llegó a existir— se consulta ~720 veces al día para siempre. Es el mismo
-- agujero que `invoices.sunat_attempts` cerró para las emisiones en 00036, y se
-- cierra igual.
ALTER TABLE public.sunat_summaries
  ADD COLUMN IF NOT EXISTS poll_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sunat_summaries.poll_attempts IS
  'Nº de consultas de ConsultarEstadoTicket. Al llegar al tope el resumen pasa a failed y deja de consultarse.';

-- Incremento atómico: PostgREST no sabe expresar `col = col + 1`. Mismo patrón
-- que fn_increment_sunat_attempts (00036).
CREATE OR REPLACE FUNCTION public.fn_increment_summary_polls(p_summary_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_attempts INTEGER;
BEGIN
  UPDATE public.sunat_summaries
  SET poll_attempts = poll_attempts + 1
  WHERE id = p_summary_id
  RETURNING poll_attempts INTO v_attempts;
  RETURN COALESCE(v_attempts, 0);
END;
$$;

COMMENT ON FUNCTION public.fn_increment_summary_polls IS
  'Incrementa y devuelve poll_attempts de un resumen SUNAT. Atómico.';

-- El índice parcial de 00039 (`WHERE status = 'pending'`) ya sirve a la consulta
-- del poller; se recrea incluyendo poll_attempts para que el filtro del tope no
-- obligue a leer la fila.
DROP INDEX IF EXISTS public.idx_sunat_summaries_pending;
CREATE INDEX IF NOT EXISTS idx_sunat_summaries_pending
  ON public.sunat_summaries (tenant_id, poll_attempts, sent_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. Interruptor de las líneas gratuitas
-- ---------------------------------------------------------------------------
-- `bilme-adapter.buildProductos` descartaba toda línea con importe 0, así que cada
-- CORTESÍA se imprimía en el ticket y NO existía en el comprobante electrónico. Lo
-- mismo le habría pasado a un adicional. Y `reference_value` —el valor referencial
-- que SUNAT exige para una operación gratuita— se calculaba en tres sitios del
-- servidor sin que ningún consumidor lo leyera.
--
-- El arreglo está implementado, pero apagado por defecto, y esto es deliberado:
-- hoy la boleta con cortesía se ACEPTA precisamente porque la línea desaparece y
-- los totales cuadran. Al declararla como gratuita, SUNAT exige además el total de
-- venta gratuita del comprobante — y la documentación de Billme lista nueve campos
-- en `totales` y NINGUNO de venta gratuita. Encenderlo sin comprobarlo contra la
-- API real podría convertir una boleta que hoy se acepta en un rechazo completo.
--
-- Procedimiento para encenderlo: emitir en beta, con el token de DESARROLLO, una
-- boleta con una línea gratuita; descomprimir el `cdrBase64` y comprobar
-- `ResponseCode 0` y que el XML lleve `AlternativeConditionPrice` con
-- `PriceTypeCode 02`. Sólo entonces:
--   UPDATE public.fact_config SET emit_free_lines = true WHERE tenant_id = '…';
ALTER TABLE public.fact_config
  ADD COLUMN IF NOT EXISTS emit_free_lines boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fact_config.emit_free_lines IS
  'Declarar cortesías y adicionales como operación gratuita ante SUNAT (cat. 07 gratuidad + cat. 16 tipo precio 02). Apagado hasta verificar contra la API real que el proveedor acepta la línea sin el total de venta gratuita.';

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Mismo criterio que 00031 y 00039: RLS activa para bloquear tráfico anónimo, sin
-- filtro por tenant en la policy (el aislamiento lo hace el código de aplicación).
-- NUNCA una policy que llame a fn_current_tenant_id() por fila: eso es exactamente
-- la regresión de ~285k scans secuenciales que 00031 vino a deshacer.
ALTER TABLE public.sunat_summary_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_sunat_summary_items" ON public.sunat_summary_items;
CREATE POLICY "authenticated_all_sunat_summary_items"
  ON public.sunat_summary_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. inventory_movements.branch_id — una contradicción de 00001
-- ---------------------------------------------------------------------------
-- La columna se definió (00001:508) como `NOT NULL` y a la vez
-- `ON DELETE SET NULL`. Las dos cosas no pueden ser ciertas: borrar una sede
-- intenta escribir NULL en una columna NOT NULL y el DELETE revienta con 23502 en
-- vez de propagarse, así que el "SET NULL" nunca fue alcanzable.
--
-- RESTRICT es la semántica real y además la correcta: un movimiento de inventario
-- es un registro histórico y no puede quedarse sin sede. Si alguien intenta borrar
-- una sede con movimientos, el error tiene que ser explícito y decir por qué.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_branch_id_fkey;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.inventory_movements.branch_id IS
  'Sede del movimiento. NOT NULL + ON DELETE RESTRICT: el histórico no puede quedarse sin sede (00041 corrigió el SET NULL inalcanzable de 00001).';
