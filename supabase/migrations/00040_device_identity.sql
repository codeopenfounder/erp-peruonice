-- Migración 00040: identidad de terminal y sobreventa detectable
-- Idempotente: re-ejecutable sin error.
--
-- Contexto
-- --------
-- POI opera con dos cajas activas contra la misma base, y hasta ahora **no había
-- ningún identificador de dispositivo en todo el sistema**: ni en `stored_config`
-- del POS, ni en los payloads de sync, ni en ninguna tabla. El filtro anti-eco del
-- canal de realtime comparaba `user_id`, así que dos terminales logueados con el
-- mismo PIN descartaban mutuamente todos sus eventos.
--
-- Además, el heartbeat escribía `cash_registers.current_opening_id` sin comprobar
-- de quién era la apertura: con dos terminales sobre una misma caja, esa columna
-- hacía ping-pong cada 2 minutos y el POS con la caja cerrada borraba la apertura
-- viva del otro.
--
-- La decisión de diseño es **una caja = un terminal**, ya implícita en la
-- migración 00038 (serie propia por caja porque el POS calcula en local el
-- correlativo que imprime). Aquí no se construye convergencia de caja entre
-- terminales: se hace el conflicto **detectable** y se impide que un terminal pise
-- el estado del otro.

-- ---------------------------------------------------------------------------
-- 1. Identidad de terminal
-- ---------------------------------------------------------------------------
-- `text` y no `uuid`: lo genera el POS y no queremos que un valor mal formado de
-- un cliente antiguo tumbe un heartbeat. Es un identificador opaco.
ALTER TABLE public.cash_register_openings
  ADD COLUMN IF NOT EXISTS device_id text;

COMMENT ON COLUMN public.cash_register_openings.device_id IS
  'Instalación de POI Fact que abrió esta caja (stored_config.device_id). NULL en aperturas anteriores a 00040.';

ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS active_device_id text;
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS active_device_seen_at timestamptz;

COMMENT ON COLUMN public.cash_registers.active_device_id IS
  'Último terminal que reportó esta caja como suya por heartbeat. Sirve para detectar dos POS sobre una misma caja.';

-- ---------------------------------------------------------------------------
-- 2. Sobreventa detectable
-- ---------------------------------------------------------------------------
-- `fn_decrement_stock` hace GREATEST(stock - qty, 0): satura en cero sin error,
-- sin excepción y sin señal de ningún tipo. Dos cajas offline venden la última
-- unidad, ambas emiten, el stock del servidor queda en 0 y no se entera nadie.
--
-- La emisión NO se bloquea: el comprobante es un acto fiscal ya consumado cuando
-- se llega aquí (ya tiene correlativo y ya está insertado). Lo que hacía falta era
-- **saber** que ocurrió.
--
-- Se añaden funciones nuevas en vez de cambiar las existentes porque el tipo de
-- retorno cambia (numeric → jsonb) y `fn_decrement_stock` tiene otros llamadores.
CREATE OR REPLACE FUNCTION public.fn_decrement_stock_checked(
  p_product_id uuid,
  p_quantity numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_kind TEXT;
  v_before NUMERIC;
  v_remaining NUMERIC;
  v_shortfall NUMERIC := 0;
BEGIN
  SELECT product_kind, stock_quantity INTO v_kind, v_before
  FROM public.products WHERE id = p_product_id;

  -- El faltante se mide contra el stock ANTES de tocarlo. Medirlo después es
  -- imposible: el clamp a cero borra justamente la evidencia.
  IF v_before IS NOT NULL AND p_quantity > v_before THEN
    v_shortfall := p_quantity - v_before;
  END IF;

  v_remaining := public.fn_decrement_stock(p_product_id, p_quantity);

  RETURN jsonb_build_object(
    'remaining', COALESCE(v_remaining, 0),
    'shortfall', v_shortfall
  );
END;
$$;

COMMENT ON FUNCTION public.fn_decrement_stock_checked IS
  'Como fn_decrement_stock, pero devuelve además cuántas unidades se vendieron sin stock. No bloquea: informa.';

CREATE OR REPLACE FUNCTION public.fn_decrement_supply_stock_checked(
  p_supply_id uuid,
  p_quantity numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_before NUMERIC;
  v_remaining NUMERIC;
  v_shortfall NUMERIC := 0;
BEGIN
  SELECT stock_quantity INTO v_before FROM public.supplies WHERE id = p_supply_id;

  IF v_before IS NOT NULL AND p_quantity > v_before THEN
    v_shortfall := p_quantity - v_before;
  END IF;

  v_remaining := public.fn_decrement_supply_stock(p_supply_id, p_quantity);

  RETURN jsonb_build_object(
    'remaining', COALESCE(v_remaining, 0),
    'shortfall', v_shortfall
  );
END;
$$;

COMMENT ON FUNCTION public.fn_decrement_supply_stock_checked IS
  'Como fn_decrement_supply_stock, pero devuelve además el faltante vendido sin stock.';

-- ---------------------------------------------------------------------------
-- NO incluido a propósito: RLS sobre realtime.messages
-- ---------------------------------------------------------------------------
-- El POS se suscribe a `stock-sync:{tenantId}` con la ANON KEY, y el canal es
-- PÚBLICO. En canales públicos Realtime no consulta `realtime.messages`, así que
-- activar RLS aquí daría una falsa sensación de seguridad sin cerrar nada:
-- cualquiera con la anon key seguiría pudiendo publicar un `batch_stock_update`
-- falso.
--
-- Cerrarlo de verdad exige tres cambios acoplados, y dejar cualquiera a medias
-- deja al POS sin recibir NADA:
--   1. el cliente del POS abre el canal con `config: { private: true }`;
--   2. ese cliente llama a `setAuth(accessToken)` — hoy usa sólo la anon key;
--   3. esta migración crea las policies de SELECT/INSERT sobre
--      `realtime.messages` filtrando por `realtime.topic()`.
-- Queda documentado en `docs/pendiente-notas-y-multipos.md` para hacerlo con dos
-- terminales delante y poder verificarlo.
