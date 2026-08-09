# ADR 0001 — Stock por sede

- **Estado**: propuesto (diseño; nada implementado)
- **Fecha**: 2026-08-08
- **Bloquea**: abrir la segunda sede

## Contexto

**Hoy no existe stock por sede.** Verificado contra la base de producción el
2026-08-08:

| Dato | Valor |
|---|---|
| Sedes (`branches`) | 1 |
| Cajas activas | 2, ambas en esa sede |
| Productos | 41 (31 con `branch_id` poblado) |
| Insumos | 1 |

`products.stock_quantity` es **un único número por tenant**. La columna
`products.branch_id` existe (documentada en `00015`) y está poblada en 31 de 41
filas, pero **no segmenta stock en ningún punto del sistema**:

- el pull de `/api/fact/sync/pull` baja **todos** los productos del tenant sin
  filtrar por sede (`select … .eq("tenant_id", …)`, sin `branch_id`);
- `get_products` en la SQLite del POS tampoco filtra;
- `fn_decrement_stock` / `fn_increment_stock` reciben `(product_id, quantity)` y
  no saben de sedes;
- el broadcast de realtime es por tenant (`stock-sync:{tenantId}`);
- los 8 reportes de `src/components/reportes/reports/` agregan por tenant.

Consecuencia con dos sedes: **vender en la sede A baja el stock que ve la sede
B.** El inventario valorizado y el kardex mezclan almacenes, y `inventory_audits`
—que sí tiene `branch_id`— audita contra un número que no es de ninguna sede.

`inventory_movements.branch_id` es `NOT NULL` y sí registra la sede, así que el
**histórico** de movimientos es recuperable por sede aunque el **saldo** no lo
sea. Eso es lo que hace viable la migración de datos.

## Decisión

Adoptar una **tabla de existencias por sede**:

```sql
CREATE TABLE public.branch_stock (
    tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entity_type    text NOT NULL CHECK (entity_type IN ('product','supply')),
    entity_id      uuid NOT NULL,
    branch_id      uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    stock_quantity numeric(12,4) NOT NULL DEFAULT 0,
    min_stock      numeric(12,4) NOT NULL DEFAULT 0,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_type, entity_id, branch_id)
);
```

`products.stock_quantity` y `supplies.stock_quantity` **se conservan** como el
total consolidado del tenant, mantenido por trigger sobre `branch_stock`. Es lo
que permite que los reportes agregados, los KPIs y el aviso de stock bajo sigan
funcionando sin reescribirse el primer día.

### Por qué no una fila de producto por sede

La alternativa evaluada era duplicar la fila de `products` por cada sede. Se
descarta:

- **rompe la identidad del catálogo**: `sku` y `barcode` tienen índices únicos por
  tenant; habría que relajarlos a `(tenant, sede)` y el mismo artículo pasaría a
  tener N SKUs;
- **duplica lo que no es stock**: precio, tipo de afectación, imagen, categorías,
  tags, promociones y **recetas** (`recipe_items`) se copiarían N veces y podrían
  divergir en silencio;
- **rompe el histórico**: `invoice_items.product_id` apunta a una fila concreta;
  duplicar significa decidir a cuál apuntan los 278 comprobantes existentes;
- **contamina el POS**: la rejilla mostraría el mismo producto N veces salvo que
  se filtre en todas partes.

La tabla de existencias mantiene una sola identidad de producto y localiza el
cambio en el eje que de verdad varía: la cantidad.

## Consecuencias

Lo que arrastra, en orden de ejecución:

1. **Migración de datos.** Crear `branch_stock` y volcar el stock actual a la
   sede única (`04c1004d-…`). Es una operación de una sola vez y sin ambigüedad
   **porque hoy sólo hay una sede**: hacerla después de abrir la segunda ya no
   sería reconstruible.
2. **RPC de stock.** `fn_decrement_stock`, `fn_increment_stock` y sus gemelas de
   insumo pasan a recibir `p_branch_id`. Las firmas actuales `(uuid, numeric)` se
   conservan un tiempo delegando en la sede por defecto, o se rompen de golpe —
   decisión de la sesión que lo implemente. Ojo con el precedente de `00029`: en
   POI ya hubo un problema de *overloads* duplicados.
   También `fn_decrement_stock_checked` (`00040`), `fn_calculate_composite_stock`
   y `fn_refresh_composite_stock_for_supply`.
3. **Compuestos.** El stock de un producto compuesto es
   `min(floor(insumo/receta))` **por sede**: la receta es global, las existencias
   no. Afecta al servidor y a `recalc_composite_stock` en `db_commands.rs`.
4. **Pull.** Filtrar por la sede de la caja del usuario
   (`cash_registers.branch_id`, que ya viaja desde `00038`) y devolver
   `stock_quantity` **de esa sede**, no el consolidado.
5. **Broadcast.** El canal es por tenant; el payload tiene que llevar `branch_id`
   y el POS descartar lo que no sea su sede. Alternativa: un canal por sede
   (`stock-sync:{tenantId}:{branchId}`), más limpio pero obliga a re-suscribir al
   cambiar de caja.
6. **POS.** `cart-store.addItem` valida contra el stock de su sede; el `Product`
   del store gana la noción de "stock de mi sede". La SQLite local **no** necesita
   `branch_stock`: cada instalación pertenece a una sola sede, así que le basta
   con recibir ya filtrado el número que le toca.
7. **Movimientos y traslados.** Aparece un tipo de movimiento nuevo —traslado
   entre sedes— que hoy no existe: dos filas en `inventory_movements` (salida en
   origen, entrada en destino) atadas por un identificador común.
8. **Reportes.** Los 8 de `components/reportes/reports/` necesitan filtro por
   sede. `inventario-valorizado` y `kardex-inventario` son los que hoy mienten
   más si hay dos sedes.
9. **Auditorías.** `inventory_audits` ya lleva `branch_id`: pasa a comparar contra
   `branch_stock` de esa sede en vez del total del tenant.

### Riesgos

- **La migración de datos sólo es trivial ahora.** Con una sola sede, todo el
  stock es de esa sede por definición. Con dos sedes ya operando sobre un único
  contador, repartir el saldo es una decisión contable, no técnica.
- **`branch_id` es nullable** en `products` y `supplies`, y 10 de 41 productos lo
  tienen NULL. `branch_stock` no depende de esa columna (la sede la aporta la
  operación), pero conviene decidir si `products.branch_id` sigue significando
  algo o se retira para no inducir a error.
- **Doble fuente de verdad.** Mantener `products.stock_quantity` como
  consolidado exige que el trigger sea la ÚNICA vía de escritura; si algún camino
  vuelve a escribir esa columna a mano, las dos cifras divergen. Ese es
  exactamente el fallo que `createInventoryMovement` producía antes de pasar a
  RPC.

## Alternativa descartada: no hacer nada y abrir la sede igual

Operativamente significa que las dos sedes comparten un contador de stock. Es
sostenible sólo si los catálogos no se solapan (cada sede vende artículos
distintos), lo cual no es el caso de un negocio de patinaje con la misma carta.
