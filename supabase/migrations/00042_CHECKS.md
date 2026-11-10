# Verificación de la migración 00042

No es una migración: son las consultas para comprobar el estado antes y después.
Se ejecutan en el SQL editor de Supabase (producción).

**Orden de despliegue:** primero se aplica `00042_atomic_pos_invoice.sql` y se
comprueba con estas consultas. Solo después se mergea el PR que cambia
`/api/fact/sync/push`. Si el código llega antes que la función, cada venta del
POS falla al subir; no se pierde nada, porque el POS la reintenta, pero ninguna
venta entra hasta aplicar la migración.

## Antes de aplicar

```sql
-- 1. La función todavía no existe. Esperado: 0 filas.
SELECT proname FROM pg_proc WHERE proname = 'fn_insert_pos_invoice';

-- 2. Contadores de las series de venta, para comparar después.
SELECT series_code, document_type, current_correlative
FROM invoice_series WHERE is_active ORDER BY series_code;
```

## Después de aplicar

```sql
-- 1. La función existe y es SECURITY INVOKER. Esperado: 1 fila, prosecdef = false.
SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'fn_insert_pos_invoice';

-- 2. Solo service_role puede ejecutarla.
--    Esperado: anon = false, authenticated = false, service_role = true.
SELECT r AS role,
       has_function_privilege(r, 'public.fn_insert_pos_invoice(jsonb, jsonb)', 'EXECUTE') AS can
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;

-- 3. Los contadores no cambiaron (la migración no toca datos).
SELECT series_code, document_type, current_correlative
FROM invoice_series WHERE is_active ORDER BY series_code;
```

## Después del merge, con una venta real

```sql
-- La última venta de cada serie tiene el número que marca su contador.
-- Esperado: ultimo_comprobante = current_correlative en las series con ventas nuevas.
SELECT s.series_code, s.current_correlative,
       max(i.correlative_number) AS ultimo_comprobante
FROM invoice_series s
LEFT JOIN invoices i ON i.series_id = s.id
WHERE s.is_active
GROUP BY s.series_code, s.current_correlative
ORDER BY s.series_code;
```

Antes de esta migración, un hueco entre `ultimo_comprobante` y
`current_correlative` era un número quemado. Los huecos viejos (por ejemplo
B001 308–310, B003 1) se quedan como están: esos números nunca llegaron a SUNAT
y no hay que anularlos.
