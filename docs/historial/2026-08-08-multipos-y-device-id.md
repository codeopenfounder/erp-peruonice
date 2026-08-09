# 2026-08-08 — Multi-POS: identidad de terminal, stock decimal y sobreventa visible

Cierra el **punto 3** de `pendiente-notas-y-multipos.md` completo, más un defecto
P0 que lo bloqueaba, la restricción de sede para notas y la UX del botón
«Anular». Ver también `docs/adr/0001-stock-por-sede.md`, que es diseño sin código.

## Por qué ahora

POI ya opera con **dos cajas activas** (`CAJA-01`, `CAJA-02`) contra la misma base.
El punto 3 era lo único de la lista de pendientes que estaba vivo en producción, no
en teoría.

## La decisión que gobierna todo: una caja = un terminal

No se construyó convergencia de caja entre terminales. La migración `00038` ya
había tomado esa decisión al dar serie propia a cada caja, porque el POS calcula en
local el correlativo que imprime: dos terminales sobre una caja ya estaban rotos
por diseño, y el arqueo lo estaría igual —saldo, timeline y efectivo esperado se
calculan al 100 % contra la SQLite de cada máquina—.

En vez de sincronizar movimientos de caja entre POS, se hizo el conflicto
**detectable** y se impidió que un terminal pise el estado del otro.

Verificado antes de decidirlo, no asumido: el único punto en el que el ERP escribe
`cash_register_movements` es `actions/gastos.ts:463` (caja chica), y ese importe ya
llega al POS agregado en cada pull (`pull/route.ts:400-422`). No había ninguna otra
escritura ERP→caja que el POS necesitara ver.

## El defecto P0 que nadie había visto

`db_commands.rs` leía `supplies.stock_quantity` —columna `REAL` **desde siempre**—
con `row.get::<i32>`. rusqlite devuelve `InvalidType`, el `unwrap_or(0)` se lo
tragaba, y **el stock local de todo producto compuesto quedaba en 0 después de cada
venta**. El pull lo recuperaba dos minutos más tarde y la venta siguiente volvía a
romperlo.

Encadenado con él: `update_product_stock` declaraba `stock_quantity: i64` mientras
el servidor devuelve `numeric`. Al primer decimal, serde rechazaba el `invoke` y,
como el llamador no lo envolvía en `try/catch`, **abortaba el resto del
post-proceso del push**.

Ambos son la misma raíz que el punto 7 clasificaba como "menor" (`stock_quantity`
INTEGER en SQLite). No era menor: era el prerrequisito de todo lo demás, porque sin
él nada de lo que llega por realtime puede aterrizar en SQLite.

`products.stock_quantity` y `min_stock` pasan a `REAL`. SQLite no soporta `ALTER
COLUMN TYPE`, así que hay rebuild de tabla de una sola vez en `db/mod.rs`, con
flag `fix_stock_real_v1` y dentro de una transacción: si falla, la tabla original
queda intacta y se reintenta en el arranque siguiente.

El recálculo del compuesto se extrajo a `recalc_composite_stock` /
`apply_recipe_delta` para poder comprobarlo sin Tauri, igual que ya se hizo con
`OPENING_TOTALS_SQL`. **4 tests nuevos, 21 en total.**

## Lo demás

**Identidad de terminal.** No existía ninguna, en ningún nivel. Ahora
`stored_config.device_id` (UUID generado una vez por `get_or_create_device_id`),
enviado en el header `X-POI-Device-Id` de todas las peticiones al ERP. El filtro
anti-eco del realtime compara contra él en vez de contra `user_id`: dos cajas con
el mismo PIN tenían el mismo `user_id` y **se descartaban mutuamente todos los
eventos**.

**Persistencia del realtime.** Sólo `product_upsert` escribía SQLite; los demás
vivían en RAM y se perdían al reiniciar. Ahora los cinco persisten, con dos
comandos Rust nuevos y transaccionales. De paso, `startRealtime` cierra el canal
anterior: cada reconexión dejaba una suscripción viva de más.

**Los broadcasts huérfanos.** `broadcastProductChange` y
`broadcastAssignmentsChange` **no tenían ni un llamador**: nada de lo que ocurría
en el ERP web llegaba a ninguna caja. Ahora emiten alta, edición, baja e ingreso de
stock de productos e insumos, el movimiento manual de inventario y la auditoría
(en lote). Todos fire-and-forget: un broadcast roto no puede tumbar la mutación que
lo originó.

**Insumos en el broadcast.** El push llamaba a `fn_decrement_supply_stock`
descartando el valor devuelto. Ahora se acumulan los insumos tocados —incluidos los
que consume la receta de un compuesto, que no pasan por ninguna RPC de supply— y se
leen de una vez.

**Sobreventa.** `GREATEST(stock − qty, 0)` satura en cero sin error ni señal. La
emisión **no se bloquea**: cuando el servidor llega al stock, el comprobante ya
tiene correlativo y ya está insertado. Lo que faltaba era saberlo.
`fn_decrement_stock_checked` (migración `00040`) mide el faltante contra el stock
*anterior*, porque el clamp destruye la evidencia. Con faltante: notificación al
módulo de inventario, `console.error` y toast en el POS. Y `cart-store.addItem`
rechazaba **en silencio** tres casos distintos; ahora los tres dicen por qué.

**El heartbeat pisaba la apertura ajena.** Escribía
`cash_registers.current_opening_id` sin comprobar de quién era: con dos terminales
la columna hacía ping-pong cada 2 minutos y el POS con la caja cerrada borraba la
apertura viva del otro. Ahora se reclama sólo si está libre o ya era suya, se
suelta sólo si la apertura que se cierra es la que tenía apuntada, y el conflicto
vuelve en la respuesta → banner en el `Topbar` y sondeo de sólo lectura al abrir
caja.

**Notas cruzadas.** `push/route.ts` compara la sede de la caja de la nota con la
del comprobante referenciado **antes de consumir el correlativo**, que es
irreversible. Distinta sede se rechaza (la devolución saldría de un cajón que nunca
cobró); distinta caja en la misma sede se acepta y queda en `audit_log`. Hasta hoy
esto era imposible sólo por accidente —la bandeja del POS es 100 % SQLite local—, y
un accidente no es una regla.

**«Anular».** Sigue sin haber anulación directa desde el POS y no la va a haber
todavía: la baja de una factura va por Resumen de Bajas, que devuelve un ticket
asíncrono que nadie consulta, y la de una boleta no puede ir por RA en absoluto. Lo
que se arregló es la experiencia: hasta ahora un comprobante que aún no había
vuelto aceptado de SUNAT **no ofrecía ninguna acción ni explicación**, y el
`VoidAuthDialog` estaba montado sin ningún disparador. Ahora hay un botón «Anular»
que siempre responde: abre la NC motivo 01 si se puede, y si no dice exactamente
por qué y a qué botón ir.

## Lo que NO se hizo, a propósito

**RLS sobre `realtime.messages`.** El POS se suscribe con la anon key y el canal es
**público**; en canales públicos Realtime ni consulta esas policies, así que
activarlas habría sido falsa seguridad. Cerrarlo de verdad exige tres cambios
acoplados —`config: { private: true }`, `setAuth(accessToken)` y las policies
filtrando por `realtime.topic()`— y dejar cualquiera a medias deja al POS sin
recibir nada. Queda documentado en el pendiente para hacerlo con dos terminales
delante.

## Verificación

- `cd kronos-fact/src-tauri && cargo test` → **21 passed; 0 failed** (17 previos +
  4 nuevos).
- `cd kronos-fact && npx tsc -b` → limpio.
- `cd poi-erp && npx tsc --noEmit` → limpio salvo dos errores **preexistentes** en
  `e2e/*.spec.ts` por falta de `@types/pg`, ajenos a este cambio.
- Estado de la base comprobado por MCP en modo lectura antes de diseñar: 2 cajas,
  1 sede, 41 productos, 1 insumo, **0 `invoice_items` con `supply_id`**, 0
  comprobantes en `issued` o `sent_to_sunat`.

**Pendiente de ejecución humana**: aplicar la migración `00040` quitando
`--read-only` deliberadamente sólo para esa ejecución. El código escribe
`cash_registers.active_device_id` y `cash_register_openings.device_id`, así que
**desplegar antes de aplicarla rompe el heartbeat**.

Falta la prueba manual con dos terminales reales; no sirve levantar dos instancias
en la misma máquina, porque comparten `stored_config` y por tanto el `device_id`.
