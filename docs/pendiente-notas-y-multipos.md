# Pendiente

Investigado y verificado. Ordenado por gravedad. Actualizado el 2026-08-08 tras
cerrar el punto 3 (multi-POS) completo, más el defecto P0 de stock local que lo
bloqueaba y la UX del botón «Anular».

> **Ya resuelto en `notas-de-credito-y-debito.md`**: la re-emisión que cobraba dos
> veces, la matriz única de efectos por motivo, el motivo 08, la prohibición de
> descuentos y bonificaciones sobre boleta, el subtipo "cantidad" de la ND 02 que
> restaba stock, el arqueo que descuadraba con tarjeta, la apertura sintética de
> la anulación y los arqueos de cierre duplicados.
>
> **Resuelto el 2026-08-08** (ver más abajo, tachado en cada punto): credenciales
> versionadas (1), series propias por caja y correlativo impreso (5), el
> correlativo diario del RA (parte de 2), y el webhook de Culqi que perdía todos
> los comprobantes de pago online.
>
> **Resuelto también el 2026-08-08, segunda tanda**: el **punto 3 entero**
> (multi-POS), el defecto P0 de stock local que lo bloqueaba, el
> read-modify-write de `createInventoryMovement` (era del punto 7) y la UX del
> botón «Anular».

---

## ~~0. El Resumen Diario (RC)~~ — RESUELTO 2026-08-08: no hace falta

**Verificado contra la API real con el token de desarrollo.** `EnviarBoletaFactura`
con `codigoTipoDocumento: "03"` **devuelve `cdrBase64`**, y al descomprimirlo aparece
un CDR real de SUNAT: `R-20613509446-03-B900-700001.xml`, raíz
`<ar:ApplicationResponse>`, `ResponseCode 0`, *"La Boleta numero B900-700001, ha sido
aceptada"*. Lo mismo con factura.

**Billme hace `sendBill` de las boletas.** El Resumen Diario no es necesario para
emitir, y el corte a producción no está bloqueado por esto. Detalle y evidencia en
`facturacion-billme.md`.

Lo que sigue siendo cierto: el RC haría falta para **anular una boleta** (ítem en
estado 3), pero eso se resuelve hoy con una NC motivo 01, que es válida y síncrona.

Lo que sigue abajo es el razonamiento anterior, que era erróneo. Se conserva para
que no se repita.

---

### Por qué se creyó bloqueante

**Lo que decía la versión anterior de este documento:**

> "Encaja con lo verificado empíricamente: `ConsultarCdr` no está disponible para
> boletas — precisamente porque la boleta no tiene CDR individual."

**Esa inferencia es incorrecta.** `ConsultarCdr` de Billme es un passthrough del
servicio `getStatusCdr` de SUNAT, y **SUNAT sólo habilita ese servicio para los
tipos 01, 07 y 08**. Nunca para boletas, con independencia de cómo se hayan
enviado. Que Billme no deje consultar el CDR de una boleta no dice absolutamente
nada sobre si la boleta llegó a SUNAT.

**Y la premisa normativa estaba desactualizada.** Desde la **RS 114-2019/SUNAT**
conviven dos vías legales para la boleta electrónica:

| Vía | Plazo | Mecanismo | Devuelve |
|---|---|---|---|
| Envío individual | emisión + **5 días calendario** | `sendBill` | CDR individual |
| Resumen Diario (RC) | emisión + **7 días calendario** | `sendSummary` | ticket, se consulta aparte |

El RC **no es obligatorio** si el integrador envía la boleta individualmente.
apisunat.pe hace exactamente eso (su respuesta de boleta trae `cdr`), y por eso
la vía actual es conforme.

Queda una sola pregunta, y es **empírica, no normativa**:

> ¿`POST /Emission/EnviarBoletaFactura` con `codigoTipoDocumento: "03"` devuelve
> `cdrBase64`?

- **Sí** → Billme hace `sendBill` de boletas. El RC no hace falta para emitir y el
  corte a producción queda desbloqueado.
- **No** → Billme sólo firma y almacena; hay que construir el RC.

**La documentación de Billme no lo resuelve**: su página de `EnviarBoletaFactura`
no documenta ninguna respuesta, y `respuesta-de-consultas` lista `cdrBase64`,
`xmlBase64` y `ticketNumber` en la misma tabla sin decir qué endpoint devuelve
cuál. Sí lista "Resumen de boletas" entre los documentos que **envía el
integrador**, así que si hiciera falta, es nuestro.

**Para responderla hace falta el token de DESARROLLO de Billme.** `fact_config`
tiene una sola columna `api_token` y hoy guarda el de apisunat. El sondeo emite
una boleta mínima contra SUNAT beta —sin efecto fiscal— y vuelca la respuesta
cruda.

Si la respuesta fuera "no", lo que falta construir es:

1. Envío del RC con todas las boletas del día y sus notas vinculadas.
2. Polling del ticket con `ConsultarEstadoTicket` y archivado del CDR.
3. Huecos de contrato que la documentación no cubre y hay que resolver contra la
   API real, decodificando el `xmlDocument` firmado que devuelve: el payload de
   `EnviarResumen` **no expone el estado por línea** (1 alta / 2 modifica / 3
   anula) que el UBL del RC exige, ni la referencia al documento afectado para
   notas 07/08, ni el desglose exonerado/inafecto (sólo `montoPagar`).
4. Un reloj: no hay cron en Vercel (`vercel.json` sólo fija región). El pull del
   POS cada 2 minutos es el único disparador disponible, y sólo sirve si hay un
   POS encendido.

~~Correlativo diario del resumen~~ — **hecho**: migración `00039` (tablas
`sunat_summaries` y `sunat_summary_counters`, RPC `fn_next_summary_correlative`).

---

## ~~1. Credenciales de producción versionadas~~ — RESUELTO 2026-08-08

Los dos scripts fueron **eliminados**. Ver
`docs/historial/2026-08-08-retiro-scripts-con-credenciales.md`.

**Corrección de un dato que este documento tenía mal**: los dos apuntaban a
`fkmvsmutslfypniruyye`, no uno a cada proyecto. Ninguno tocó POI. Verificado
contra la base: `fact_config.allow_offline_product_sales` —que
`migrate-stock-sync.mjs` creaba en la misma ejecución— **no existe** en
`ctlvfkiwpmyljeofgitz`, y `create-indexes.mjs` indexaba `approval_requests` y
`leave_requests`, tablas que no existen en POI.

**Queda acción humana**: rotar la contraseña de `fkmvsmutslfypniruyye` y decidir
sobre la purga del historial de git. Runbook en la entrada de historial.

---

## 2. Resumen de Bajas (RA) y el botón "Anular"

~~El correlativo del RA iba fijo a `"1"`~~ — **hecho**: lo aporta ahora
`/api/fact/sunat` resolviéndolo con `fn_next_summary_correlative()`, el resumen se
registra en `sunat_summaries` con su ticket, y el comprobante anulado pasa a
`sunat_ticket_status = 'pending'` (columna que existía desde `00030` y no escribía
nadie). El adapter sigue siendo puro: recibe el correlativo, no lo busca.

**También corregido**: el adapter de Billme aceptaba anular una boleta por RA. No
se puede: el RA (`VoidedDocuments`) cubre facturas y las notas vinculadas a
factura. La baja de una boleta va dentro de un Resumen Diario con el ítem en
estado 3. Ahora se rechaza con un mensaje que dice qué hacer en su lugar.

**Corrección de plazo**: este documento decía "sólo dentro de los 5 días desde la
emisión". El plazo oficial es **hasta el sétimo día calendario** contado desde el
día siguiente al de recepción de la CDR aceptada del Resumen Diario (o desde el
día siguiente al de emisión, si las boletas no se habían informado todavía).

Lo que sigue pendiente:

- ~~El botón "Anular" del POS sigue deshabilitado~~ — **resuelto 2026-08-08 como
  UX, no como anulación directa.** No hay anulación directa desde el POS y no la va
  a haber todavía: la baja de una **factura** va por RA, que devuelve un ticket y
  no una aceptación (exige el polling de abajo), y la de una **boleta** no puede ir
  por RA en absoluto — iría por Resumen Diario en estado 3, que no está construido.
  La NC motivo 01 sigue siendo la vía correcta para las dos.

  Lo que se arregló es que el cajero ya no se queda sin respuesta: hay una acción
  «Anular» visible en toda fila de comprobante original no anulado, que abre la NC
  motivo 01 cuando se puede y, cuando no, explica por qué (aún viajando a SUNAT,
  rechazado, o saldo ya agotado) y ofrece el atajo correcto. Se retiró además el
  `VoidAuthDialog` que estaba montado sin ningún disparador.
- `voidInvoice()` (`invoice-store.ts:200`) es puramente online y **no toca
  SQLite**: no revierte stock local ni crea movimiento de caja local.
- **Billme no valida el RUC del emisor** contra el token en desarrollo (se aceptó
  una boleta con un RUC ajeno). Conviene validarlo en el ERP antes de enviar.
- Falta consultar el ticket: `sunat_summaries.status` se queda en `pending` para
  siempre porque nadie llama a `ConsultarEstadoTicket`.

  **El contrato ya está verificado contra la documentación de Billme** (2026-08-08),
  así que la próxima sesión no tiene que investigarlo:

  ```
  POST https://www.api.billmeperu.com/api/v1/Emission/ConsultarEstadoTicket
  { numDocEmisor, numTicket, tipoComprobante: "RC"|"RA", serie, correlativo }
  ```

  `serie` es el **`AAAAMMDD`** del identificador del resumen y `correlativo` el N
  dentro de esa fecha — o sea, exactamente las dos columnas que ya guarda
  `sunat_summaries` (`reference_date` y `correlative`). La respuesta sale por el
  sobre habitual (`description`, `faultCode`, `cdrBase64`, `xmlBase64`); Billme no
  documenta ningún ejemplo, así que el mapeo a `accepted` / `rejected` /
  `pending` hay que fijarlo contra la API real, con la referencia de SUNAT de que
  `statusCode 0` trae el CDR y `98` significa "en proceso".

  Reloj disponible: **no hay cron en Vercel** (`vercel.json` sólo fija región). El
  disparador natural es `autoRetrySunat()` en `/api/fact/sync/pull`, que ya corre
  cada 2 minutos siempre que haya un POS encendido, más un botón manual en el ERP.

- **`autoRetrySunat` pierde `reference_value`** de los insumos gratuitos: su
  `select` de ítems (`pull/route.ts:100-103`) omite `supply_id`, a diferencia del
  retry manual (`sunat/route.ts:411-415`) y del push. Sigue pendiente, aunque hoy
  es inofensivo porque no existe ningún `invoice_item` con `supply_id`.

---

## ~~3. Sincronización multi-POS~~ — RESUELTO 2026-08-08

**Decisión que gobierna el arreglo: una caja = un terminal.** Ya estaba implícita
en la migración `00038` (serie propia por caja, porque el POS calcula en local el
correlativo que imprime). Por eso **no se construyó convergencia de caja entre
terminales**: se hizo el conflicto detectable y se impidió que un terminal pise el
estado del otro. Verificado que basta: el único punto donde el ERP escribe
`cash_register_movements` es `actions/gastos.ts:463` (caja chica), y ese importe ya
llega al POS agregado en cada pull.

Los seis puntos originales:

1. ~~El broadcast se filtra por usuario, no por dispositivo~~ — **hecho**. Existe
   `stored_config.device_id` (UUID generado una vez por el comando Rust
   `get_or_create_device_id`), viaja en el header `X-POI-Device-Id` de **todas**
   las peticiones al ERP, `FactContext` lo expone y el filtro anti-eco de
   `realtime-sync.ts` compara contra él.
2. ~~`stock_update` y `product_delete` no persisten en SQLite~~ — **hecho**. Los
   cinco handlers escriben ahora en SQLite (`batch_update_product_stock`,
   `batch_update_supply_stock` y `deactivate_product`, nuevos y transaccionales).
   Además `startRealtime` cierra el canal anterior: cada reconexión dejaba una
   suscripción viva de más.
3. ~~`broadcastProductChange` y `broadcastAssignmentsChange` sin llamadores~~ —
   **hecho**. Emiten `products.ts` (alta, edición, baja, ingreso de stock),
   `supplies.ts`, `inventory-movements.ts` e `inventory-audits.ts` (en lote), todos
   fire-and-forget y con `source: "erp"`.
4. ~~Sobreventa silenciosa~~ — **hecho**, con el matiz de que **no se bloquea la
   emisión**: cuando el servidor llega al stock, el comprobante ya tiene
   correlativo y ya está insertado. Migración `00040`:
   `fn_decrement_stock_checked` devuelve `{remaining, shortfall}` midiendo el
   faltante contra el stock *anterior* (después el clamp a cero borra la
   evidencia). Con faltante: notificación al módulo de inventario, `console.error`
   y toast en el POS. Además `cart-store.addItem` rechazaba en silencio tres casos
   distintos; ahora los tres dicen por qué.
5. ~~Los insumos nunca se propagan por broadcast~~ — **hecho**. `push/route.ts`
   acumula los insumos tocados —incluidos los que consume la receta de un
   compuesto, que no pasan por ninguna RPC de supply— y los lee de una vez;
   `batch_stock_update` lleva `supply_updates`.
6. ~~No existe restricción de caja/sede para emitir una NC~~ — **hecho**.
   `push/route.ts` compara la sede de la caja de la nota con la del comprobante
   referenciado **antes de consumir el correlativo**: distinta sede se rechaza
   (la devolución saldría de un cajón que nunca cobró), distinta caja en la misma
   sede se acepta y queda en `audit_log` como `cross_register_note`.

Y tres defectos más, encontrados durante la investigación:

7. **El heartbeat pisaba `cash_registers.current_opening_id` sin comprobar
   propiedad**: con dos terminales la columna hacía ping-pong cada 2 minutos y el
   POS con la caja cerrada **borraba la apertura viva del otro**. Ahora la caja se
   reclama sólo si está libre o ya era suya, se suelta sólo si la apertura que se
   cierra es la que tenía apuntada, y el conflicto vuelve en la respuesta.
8. **No había forma de saber que dos terminales compartían caja.** Ahora hay
   banner permanente en el `Topbar` y, al abrir caja, un sondeo de sólo lectura
   (`probe`) que avisa y exige un segundo clic. No bloquea: sin conexión se abre
   igual y el heartbeat lo detecta después.
9. ~~El pull incremental devolvía series desactivadas~~ — hecho en la tanda
   anterior.

### Lo que NO se hizo, a propósito

- **RLS sobre `realtime.messages`.** El POS se suscribe con la anon key y el canal
  es **público**; en canales públicos Realtime ni consulta esas policies, así que
  activarlas sería falsa seguridad. Cerrarlo de verdad exige tres cambios
  acoplados —`config: { private: true }` en el cliente, `setAuth(accessToken)`, y
  las policies filtrando por `realtime.topic()`— y dejar cualquiera a medias deja
  al POS sin recibir nada. Hacerlo con dos terminales delante.
- **Convergencia de caja entre terminales**: descartada por diseño, ver arriba.
- `void-auth-dialog.tsx` se quedó **sin importadores** al retirar el diálogo
  huérfano de `comprobantes.tsx`. Se conserva en disco por si vuelve la anulación
  directa; si no, va a la lista de código muerto del punto 7.

---

## 4. Stock por sede — bloqueante para el multi-sede

**No existe stock por sede.** `products.stock_quantity` es un único número por
tenant y el pull baja **todos** los productos sin filtrar por `branch_id`;
`get_products` en SQLite tampoco filtra. La columna `products.branch_id` existe
(documentada en `00015:29-31`) pero **nunca se usa para segmentar stock**.

Con varias sedes: **vender en la sede A baja el stock que ve la sede B.**

**Diseño hecho el 2026-08-08**: `docs/adr/0001-stock-por-sede.md`. Recomienda una
tabla `branch_stock` (no filas de producto por sede) y enumera el arrastre: RPC
con `branch_id`, compuestos por sede, pull filtrado, broadcast, carrito, traslados
entre sedes, los 8 reportes y las auditorías. **Nada implementado.**

Lo más importante del ADR: **la migración de datos sólo es trivial ahora**. Con una
sola sede, todo el stock es de esa sede por definición; con dos sedes ya operando
sobre un contador único, repartir el saldo pasa a ser una decisión contable.

~~`stored_config.branch_id` y `branch_name` no se escriben nunca~~ — **hecho**: el
pull ya devuelve `cash_registers.branch_id` (full e incremental) y `branches` en el
incremental, que era lo que impedía que el bloque de `sync-engine.ts:238-254`
llegara siquiera a ejecutarse. ~~`invoice_series.branch_id` siempre NULL~~ —
**hecho**: se deriva de la caja en el servidor y se rellenó en `00038`.

---

## ~~5. El correlativo impreso puede no ser el real~~ — RESUELTO 2026-08-08

Eran tres defectos encadenados, los tres corregidos:

1. **CAJA-02 no tenía series propias** porque `createCashRegister` creaba la caja y
   ninguna serie, y el POS caía al fallback de `create-invoice.ts` emitiendo sobre
   las series de Caja Principal. Ahora: migración `00038` crea `B002`/`F002`,
   `createCashRegister` crea las series de toda caja nueva, hay un índice único
   parcial `(tenant, tipo, caja)`, y la pestaña Series avisa de cualquier caja
   activa sin serie propia. El fallback del POS sigue existiendo —bloquear una
   venta es peor— pero es determinista y deja un `console.warn`.
2. **`get_next_local_correlative` no incrementaba la fila** (`db_commands.rs`):
   devolvía `current + 1` sin escribir, así que dos ventas seguidas sin pull
   intermedio imprimían **el mismo número**. Ahora es `UPDATE ... RETURNING`.
   Cubierto por dos tests nuevos en `cargo test`.
3. **El POS descartaba el correlativo real** que el servidor devuelve en el push.
   Ahora lo adopta (`adopt_server_correlative`) y, si difiere del impreso, avisa al
   cajero de que reimprima.

Sigue en pie, documentado y aceptado: `fn_next_correlative` se consume **antes**
del INSERT, así que un insert fallido deja un hueco. SUNAT valida unicidad, no
continuidad.

---

## 6. Hallazgos de la prueba end-to-end sobre el POS real

### 6.1 `addSupplyItem` no tiene ni un llamador

La pestaña "Adicionales" del POS abre siempre el diálogo de *salida operativa*
(`product-grid.tsx:60-63`, `handleSupplyClick` → `StockOutputDialog`), nunca añade
el insumo como línea del comprobante. Confirmado contra la base: **0
`invoice_items` con `supply_id` en toda la historia**.

**La cadena completa ya existe y funciona**: carrito
(`cart-store.ts:675`) → `create-invoice.ts:259,277` (fuerza `product_id = null`
cuando hay `supply_id`) → SQLite (`schema.sql:136`) → Rust
(`db_commands.rs`, INSERT + movimiento de stock del insumo) → push
(`push/route.ts`, valida la FK y escribe `invoice_items.supply_id`) → Supabase
(`00001:444`) → SUNAT como `reference_value` = `supplies.cost_price`. **El único
eslabón roto es un `onClick`.**

Pero antes hay **tres decisiones de producto** que no están tomadas:

1. **`supplies` no tiene precio de venta**, sólo `cost_price` (verificado contra
   la base). `addSupplyItem` fuerza `unit_price: 0`, `tax_type: "inafecto"` e
   `igv_rate: 0`, y la UI ya promete "Gratis". O sea que hoy un adicional sólo
   puede ser **gratuito**, no cobrado. Cobrarlo exige columna nueva y decidir su
   afectación de IGV.
2. **¿El clic debe elegir** entre "añadir al ticket" y "salida operativa"? Son dos
   operaciones distintas sobre el mismo botón.
3. **`tax_type: "inafecto"` no es lo mismo que "gratuito" ante SUNAT** (catálogo
   07 tiene códigos propios para transferencias gratuitas). Hoy sólo se apoya en
   `reference_value`; conviene comprobar contra la API real qué hace Billme con
   esa combinación antes de emitir.

Y un bug latente: `addSupplyItem` **no llama a `recalcPromotion`**, a diferencia de
`addItem`/`removeItem`/`updateQuantity`. Y `recalcPromotion` sólo excluye los
adicionales cuando `applies_to` es `"products"` o `"services"`: con cualquier otro
valor entran en `applicableQty` y **un adicional gratis podría desbloquear o
multiplicar una promoción**.

### 6.2 La cortesía exige validar el PIN contra el ERP

`cortesia-dialog.tsx:65` llama a `validatePin` siempre, incluso para un gerente o
supervisor. En un POS offline-first eso significa que **sin conexión no se puede
dar una cortesía**. Mismo defecto en `stock-output-dialog.tsx:74` (que además
acepta `cajero`), y es justo el diálogo que abre la pestaña "Adicionales": los dos
hallazgos se cruzan ahí.

**El arreglo es de frontend y tiene dos implementaciones de referencia en el propio
repo**: `credit-note-dialog.tsx:155,237-246,250-251` y `void-auth-dialog.tsx:23,48-55,66-67`
calculan `isSelfAuthorized` desde el `auth-store` y cortocircuitan `validatePin`.
Cero red, cero backend.

Lo que **no** es un arreglo sino funcionalidad nueva: "cajero pide PIN de
supervisor sin conexión". No existe ninguna pieza — la SQLite del POS no tiene
tabla de usuarios ni de PINs, no hay comando Rust de PIN, y el pull no baja
usuarios. Además `fact_user_assignments.pin_code` está **en claro** y son 4
dígitos: cualquier esquema offline es fuerza-brutable en milisegundos si alguien
tiene el fichero, así que la protección tendría que venir del cifrado del almacén
local, no del hash.

Matiz que conviene recordar: el `auth-store` **no persiste**. Aun con
`isSelfAuthorized`, una app reiniciada sin red no tiene ni `cargo`, porque el
relogin por PIN también es online.

### 6.3 Notas que agotan el saldo

~~Una nota que agota el saldo retira los botones de nota del comprobante~~ —
sigue siendo el comportamiento correcto, pero ya **se explica**: la línea `NC:` de
la fila lleva un `title` que dice "Totalmente acreditado: no admite más notas".

## 7. Menores

- ~~Probable doble *overload* de `fn_decrement_stock`~~ — **no aplica a POI**. El
  script que creaba `(uuid, int)` corría contra `fkmvsmutslfypniruyye`. Verificado
  contra la base: en POI sólo existe la versión `(uuid, numeric)` de `00003`.
- ~~El webhook de Culqi insertaba `invoices.branch_id`~~ — **RESUELTO**. La columna
  **no existe** (verificado contra la base): PostgREST rechazaba el INSERT entero,
  el error no se comprobaba y **cada pago online se quedaba sin comprobante en
  silencio**, quemando además un correlativo de boleta. Se quitó el campo, se
  comprueba el error y la selección de serie pasó a ser determinista
  (`order("series_code")` en vez de un `limit(1)` sin orden).
- ~~**`createInventoryMovement`** hacía read-modify-write no atómico~~ —
  **RESUELTO 2026-08-08**. Pasa por `fn_{in,de}crement_{,supply_}stock`, comprueba
  el error (el `UPDATE` anterior tampoco lo hacía) y emite el broadcast. Tenía un
  tercer defecto no reportado: sobre un producto **compuesto** escribía un
  `stock_quantity` que el siguiente recálculo de receta pisaba; las RPC sí
  resuelven ese caso.
- ~~**`products.stock_quantity` es `INTEGER` en SQLite**~~ — **RESUELTO
  2026-08-08, y era P0, no menor.** Pasa a `REAL` (rebuild de tabla de una sola
  vez en `db/mod.rs`, flag `fix_stock_real_v1`; SQLite no soporta `ALTER COLUMN
  TYPE`). Lo que el informe original no vio:
  - `db_commands.rs` leía `supplies.stock_quantity` —columna REAL **desde
    siempre**— con `row.get::<i32>`. rusqlite devuelve `InvalidType`, el
    `unwrap_or(0)` se lo tragaba, y **el stock local de todo producto compuesto
    quedaba en 0 después de cada venta**. Se recuperaba en el pull y volvía a
    romperse en la venta siguiente.
  - `update_product_stock` declaraba `stock_quantity: i64` mientras el servidor
    devuelve `numeric`: al primer decimal serde rechazaba el `invoke` y, sin
    try/catch, **abortaba el resto del post-proceso del push**.
  - Cubierto por 4 tests nuevos en `cargo test` (21 en total). El recálculo del
    compuesto se extrajo a `recalc_composite_stock` / `apply_recipe_delta`
    justamente para poder comprobarlo sin Tauri.
- **`autoRetrySunat` pierde `reference_value`** — detallado en el punto 2.
- **`inventory_movements` que se pierden**: `branch_id` es `NOT NULL`
  (`00001:508`) pero `branchId` puede quedar `null`, y los tres INSERT no
  comprueban el error. Son `push/route.ts` (los tres del comprobante), más **tres
  más en `sunat/route.ts`** (los `nc_return` de la anulación, cuyo `voidBranchId`
  no tiene ni fallback: una anulación de un comprobante sin caja —un pago Culqi—
  pierde los tres) y **cuatro en `actions/`**. El único sitio que sí comprueba el
  error es `inventory-movements.ts`, que es también el único que fuerza `null`
  deliberadamente. La columna es además auto-contradictoria: `NOT NULL` con
  `ON DELETE SET NULL`.
- **`MAX_SUNAT_ATTEMPTS = 5` sin dead-letter**: tras 5 fallos el comprobante queda
  en `issued` para siempre, invisible: el filtro `.lt("sunat_attempts", 5)` del
  pull deja de verlo y **el estado nunca cambia**. `sunat_attempts` no aparece en
  ninguna UI del ERP (3 apariciones en todo `poi-erp/src`, ninguna de interfaz), y
  la página de comprobantes no ofrece acción "Reintentar". El único rescate manual
  está **en el POS**, así que depende de que un cajero abra caja y se fije.
- El primer ticket impreso tras cobrar **no lleva hash**: el hash sólo existe
  después de que el proveedor firme, y el POS es offline-first. La reimpresión sí
  lo lleva.
- **Código muerto**, verificado uno a uno:
  - Muertos sin matices: `kronos-fact/src/lib/invoicing/ruc-validator.ts`,
    `kronos-fact/src/lib/invoicing/tax-calculator.ts`,
    `kronos-fact/src/commands/invoke.ts`, `poi-erp/src/lib/sunat/apisunat.ts`
    (shim legacy). Los cuatro nacieron el mismo minuto del 2026-03-05 y nunca se
    tocaron. Ahora se suma `kronos-fact/src/components/cpe/void-auth-dialog.tsx`.
  - `sync_commands.rs` **sí está registrado** en el `invoke_handler` de
    `lib.rs`, pero sus únicos llamadores TS están en `commands/invoke.ts`, que no
    tiene importadores. Además está sin terminar (dos `// TODO`).
  - `sales.tsx` **sí está ruteado** en `main.tsx:8,25` como `/ventas`, pero nada
    enlaza esa ruta y el componente es un mock estático de 44 líneas. Lo real es
    `comprobantes.tsx`.
  - **`CLAUDE.md:245` afirma que `ruc-validator.ts` valida el RUC. Es falso**: el
    checksum módulo-11 está bien implementado y **nadie lo llama**. Hoy no hay
    ninguna validación de RUC activa en ningún punto de captura de cliente. Los
    únicos `checkDigit` del repo son de código de barras EAN.
- **`src/types/database.ts` está desalineado, y es peor de lo que decía esta
  lista**: no es un fichero generado — está escrito a mano, tiene **un solo
  commit** (2026-03-20), va **37 migraciones por detrás** y no existe script
  `db:types`. Declara `invoices.branch_id`, que **no existe**: exactamente la
  columna del bug del webhook de Culqi. Declara `invoice_series.series` y
  `.current_number` (los nombres reales son `series_code` y
  `current_correlative`), le faltan los 7 valores reales de `document_type`, y su
  `FactConfig` describe configuración de impresora que en la realidad vive en la
  SQLite del POS. No ha estallado porque **sólo lo importan dos ficheros**
  (`actions/users.ts` y `stores/auth-store.ts`, y sólo para `Cargo`, `Profile` y
  `Tenant`). El riesgo es de trampa: quien importe `Invoice` de ahí creyendo que
  son tipos generados compilará en verde contra columnas inexistentes.

---

## 8. Estado fiscal real del sistema (sondeo del 2026-08-08)

Conviene tenerlo delante antes de planificar cualquier corte de proveedor.

- **278 comprobantes en la base, pero sólo 21 los emitió el POS.** Los otros 253
  están en `accepted` sin `xml_url`, sin `sunat_document_id`, sin `hash_code` y sin
  `sunat_response_code`, y sus `created_at` caen todos en segundo `:00` — son
  registros históricos cargados a mano, no emisiones.
- **Ninguna emisión real llegó nunca a producción.** Las 14 con evidencia apuntan a
  `sandbox.apisunat.pe`. Las 6 últimas (4–6 de mayo) están en `rejected` con el
  mismo mensaje: *"Esta empresa no tiene autorización para emitir documentos en el
  entorno de producción."*
- **`fact_config.is_production = true`** con `provider = apisunat`. Es decir: hoy,
  si el POS emite, el comprobante se rechaza. Hay que dar de alta la empresa en
  producción del proveedor (o volver a homologación) antes de operar.
- **`detraction_account` está en NULL**: una factura con SPOT sería rechazada.
- No hay ningún comprobante en `issued` ni en `sent_to_sunat`, así que el bucle de
  auto-retry no tiene nada pendiente.
