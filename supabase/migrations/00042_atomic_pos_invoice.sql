-- Migración 00042: número fiscal y comprobante del POS en una sola transacción
-- Idempotente: re-ejecutable sin error. Sólo añade una función (expand): el
-- código que todavía usa fn_next_correlative sigue funcionando igual.
--
-- Contexto
-- --------
-- `/api/fact/sync/push` guardaba un comprobante del POS en tres llamadas
-- separadas: `fn_next_correlative()` (UPDATE del contador de la serie), INSERT en
-- `invoices` y INSERT en `invoice_items`. Cada llamada de PostgREST es su propia
-- transacción, así que si el INSERT del comprobante o de sus líneas fallaba, el
-- número ya estaba consumido y se perdía. El POS reintentaba 30 s después y la
-- venta salía con el número siguiente: el ticket impreso decía 00000001 y SUNAT
-- recibía el 00000002.
--
-- El 2026-11-09 la causa concreta fue la apertura de caja (FK de
-- `invoices.opening_id`), y el PR #9 la resolvió. Pero cualquier otro fallo del
-- INSERT —una FK, un CHECK, un comprobante enviado dos veces a la vez— seguía
-- quemando el número.
--
-- Esta función hace las tres cosas dentro de una transacción: si algo falla,
-- también se deshace el UPDATE del contador y el número queda libre para el
-- reintento.

-- ---------------------------------------------------------------------------
-- fn_insert_pos_invoice(p_invoice, p_items) -> correlativo asignado
-- ---------------------------------------------------------------------------
-- p_invoice: columnas de `invoices`, SIN `correlative_number` (lo pone la
--            función). Las columnas omitidas toman su DEFAULT.
-- p_items:   array de filas de `invoice_items`, cada una con su `invoice_id`.
--
-- Las columnas salen de las claves del JSON y los valores pasan por
-- jsonb_populate_record(NULL::tabla), es decir, se convierten al tipo de cada
-- columna igual que lo haría PostgREST. Así el route sigue siendo la única fuente
-- de verdad de qué se guarda, sin duplicar aquí la lista de 45 columnas. Una
-- clave que no sea columna da error y no guarda nada.
--
-- Concurrencia: el UPDATE bloquea la fila de la serie hasta el COMMIT, así que
-- dos ventas de la misma serie se ordenan solas, igual que con
-- fn_next_correlative. La transacción es corta: dos INSERT.
--
-- SECURITY INVOKER: corre con los permisos de quien la llama (service_role desde
-- el route) y respeta RLS. Además sólo service_role puede ejecutarla.
CREATE OR REPLACE FUNCTION public.fn_insert_pos_invoice(
    p_invoice jsonb,
    p_items   jsonb DEFAULT '[]'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_series_id   uuid;
  v_tenant_id   uuid;
  v_correlative integer;
  v_invoice     jsonb;
  v_cols        text;
BEGIN
  IF p_invoice ? 'correlative_number' THEN
    RAISE EXCEPTION 'correlative_number lo asigna fn_insert_pos_invoice, no quien la llama'
      USING ERRCODE = '22023';
  END IF;

  v_series_id := (p_invoice ->> 'series_id')::uuid;
  v_tenant_id := (p_invoice ->> 'tenant_id')::uuid;
  IF v_series_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'series_id y tenant_id son obligatorios' USING ERRCODE = '22023';
  END IF;

  -- La serie tiene que ser del mismo tenant que el comprobante: un series_id
  -- ajeno no puede mover el contador de otra empresa.
  UPDATE public.invoice_series
     SET current_correlative = current_correlative + 1
   WHERE id = v_series_id
     AND tenant_id = v_tenant_id
  RETURNING current_correlative INTO v_correlative;

  IF v_correlative IS NULL THEN
    RAISE EXCEPTION 'La serie % no existe para este tenant', v_series_id USING ERRCODE = 'P0002';
  END IF;

  v_invoice := p_invoice || jsonb_build_object('correlative_number', v_correlative);

  SELECT string_agg(quote_ident(k), ', ')
    INTO v_cols
    FROM jsonb_object_keys(v_invoice) AS k;

  EXECUTE format(
    'INSERT INTO public.invoices (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.invoices, $1)',
    v_cols
  ) USING v_invoice;

  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    SELECT string_agg(quote_ident(k), ', ')
      INTO v_cols
      FROM (
        SELECT DISTINCT jsonb_object_keys(e) AS k
          FROM jsonb_array_elements(p_items) AS e
      ) AS keys;

    EXECUTE format(
      'INSERT INTO public.invoice_items (%1$s) SELECT %1$s FROM jsonb_populate_recordset(NULL::public.invoice_items, $1)',
      v_cols
    ) USING p_items;
  END IF;

  RETURN v_correlative;
END;
$$;

COMMENT ON FUNCTION public.fn_insert_pos_invoice(jsonb, jsonb) IS
  'Asigna el correlativo de la serie e inserta el comprobante del POS con sus líneas en una sola transacción. Si algo falla, el número no se consume.';

REVOKE ALL ON FUNCTION public.fn_insert_pos_invoice(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insert_pos_invoice(jsonb, jsonb) TO service_role;

-- PostgREST tiene que ver la función nueva para exponerla en /rpc.
NOTIFY pgrst, 'reload schema';
