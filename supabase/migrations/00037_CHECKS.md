# Comprobaciones alrededor de la migración 00037

No forma parte de la migración: son las consultas para ejecutar en el SQL editor
del Dashboard **antes y después** de aplicar `00037_note_effects_and_reissue.sql`.

## Antes — qué borraría el DELETE

La migración colapsa al más reciente los arqueos de **cierre** duplicados por
apertura, porque el índice único no puede crearse con duplicados presentes.
Mira primero cuántos hay y de qué fechas:

```sql
SELECT opening_id,
       COUNT(*)          AS arqueos_de_cierre,
       MIN(created_at)   AS primero,
       MAX(created_at)   AS ultimo,
       ARRAY_AGG(counted_amount ORDER BY created_at) AS montos_contados
FROM public.cash_register_arqueos
WHERE type = 'cierre' AND opening_id IS NOT NULL
GROUP BY opening_id
HAVING COUNT(*) > 1
ORDER BY MAX(created_at) DESC;
```

Si devuelve filas con **montos contados distintos**, no las borres a ciegas:
significa que alguien cerró la caja dos veces con conteos diferentes y hay que
decidir cuál vale. Si los montos coinciden, son reenvíos del heartbeat y quedarse
con el último es correcto.

## Antes — motivos fuera de catálogo

El `CHECK` nuevo acota `reference_reason` a los códigos de los catálogos 09 y 10.
La migración lo añade `NOT VALID` y valida aparte, avisando en vez de fallar,
pero conviene saberlo de antemano:

```sql
SELECT document_type, reference_reason, COUNT(*)
FROM public.invoices
WHERE reference_reason IS NOT NULL
  AND document_type IN ('nota_credito','nota_debito')
GROUP BY 1, 2
ORDER BY 1, 2;
```

Esperado: solo `01`–`10` en `nota_credito` y `01`–`03` en `nota_debito`.

## Después — que quedó aplicada

```sql
-- 1. Columna de re-emisión
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'invoices' AND column_name = 'reissue_of_invoice_id';

-- 2. Columna generada del arqueo + su índice único
SELECT column_name, is_generated, generation_expression
FROM information_schema.columns
WHERE table_name = 'cash_register_arqueos' AND column_name = 'cierre_opening_id';

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'cash_register_arqueos'
  AND indexname = 'idx_arqueos_cierre_opening_unique';

-- 3. CHECK de motivos
SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.invoices'::regclass
  AND conname = 'invoices_reference_reason_check';

-- 4. Ya no quedan cierres duplicados
SELECT COUNT(*) AS aperturas_con_cierre_duplicado
FROM (
  SELECT opening_id FROM public.cash_register_arqueos
  WHERE type = 'cierre' AND opening_id IS NOT NULL
  GROUP BY opening_id HAVING COUNT(*) > 1
) d;   -- debe dar 0
```

`convalidated = false` en el punto 3 significa que hay filas históricas fuera del
catálogo: la restricción rige para las nuevas, pero conviene mirar qué son.

## Después — que nada se movió de más

Contadores de referencia, para comparar con los de antes:

```sql
SELECT series_code, document_type, current_correlative
FROM public.invoice_series
ORDER BY document_type, series_code;

SELECT type, COUNT(*), SUM(amount)
FROM public.cash_register_movements
GROUP BY type ORDER BY type;
```
