# Ciclo asíncrono de anulación, autorización offline y menores

**Fecha**: 2026-08-09
**Migración**: `00041_void_cycle_and_movements.sql`
**Versión de POI Fact**: 1.0.2 → **1.0.3**
**Repos tocados**: `poi-erp`, `kronos-fact`

---

## Lo que se corrigió antes de empezar: la premisa

El pendiente decía que «nada de esto está desplegado» y que `poi-erp` tenía 37
ficheros sin commitear. **No era cierto ya.** Verificado al abrir la sesión:

| Repo | Árbol | Remoto | Estado |
|---|---|---|---|
| `poi-erp` | limpio | `codeopenfounder/erp-peruonice` | `ffc9519` empujado a `origin/feat/multipos-device-identity`; `origin/main` 1 commit por detrás |
| `kronos-fact` | limpio | **sí tiene remoto**: `codeopenfounder/poi-fact` | 3 commits, todos empujados |
| `poi-lector` | 2 modificados (`tsconfig.tsbuildinfo`, `vite.config.ts`) | `codeopenfounder/lector-peruonice` | sincronizado |

Y contra la base de producción: las migraciones **00037–00040 ya estaban
aplicadas**. Lo que faltaba desplegar era el fast-forward de `main` y, sobre todo,
**regenerar el instalador**: el `POI-Fact-Setup-v1.0.2.exe` que servía el ERP era
anterior a los cambios de multi-POS, así que el `device_id` y el arreglo del stock
decimal no estaban en el binario que se descargaba.

`CLAUDE.md` afirmaba también que `kronos-fact` no tenía remoto ni commits.
Corregido.

---

## 1. El ticket del resumen de bajas, que nadie consultaba

**El problema.** `EnviarResumen` no responde con una aceptación: responde con un
**ticket**. La validación real llega después, consultando `ConsultarEstadoTicket`.
Nadie lo consultaba, así que `sunat_summaries.status` se quedaba en `pending` para
siempre y `/api/fact/sunat` marcaba el comprobante `voided` con un simple acuse de
recepción. El sistema afirmaba que un comprobante estaba anulado ante SUNAT sin
tener una sola prueba de que lo estuviera.

**Lo que se construyó:**

- **`checkTicket()`** en el contrato `SunatProvider` (`lib/sunat/types.ts`),
  implementado en el adapter de Billme contra
  `POST /Emission/ConsultarEstadoTicket`. `serie` es el `AAAAMMDD` del resumen y
  `correlativo` el N dentro de esa fecha: exactamente `sunat_summaries.reference_date`
  y `.correlative`. apisunat devuelve `accepted` sin tocar la red, porque su
  `void()` resuelve en la misma llamada.
- **`lib/sunat/poll-summaries.ts`**: lee los resúmenes `pending` con ticket, los
  consulta de cinco en cinco, persiste el veredicto comprobando el error del
  UPDATE y resuelve los comprobantes enlazados.
- **`sunat_summary_items (summary_id, invoice_id)`** en la migración 00041. Sin
  este enlace el polling sabía si SUNAT había aceptado la baja pero no a qué
  comprobante aplicarla: el resumen y el comprobante eran dos hechos sin relación.
  Es tabla y no columna porque un RC futuro lleva N boletas.
- **`sunat_summaries.poll_attempts`** + `fn_increment_summary_polls`, con tope de
  20 (~40 minutos a un pull cada 2 min). Sin tope, un ticket que SUNAT nunca
  resuelve se consultaría ~720 veces al día para siempre: el mismo agujero que
  `sunat_attempts` cerró para las emisiones.
- **`pending_void` pasa a escribirse.** Existía en el CHECK de `invoices.status`
  desde la migración 00001 y tenía badge en la UI desde siempre, y **nadie lo
  escribía nunca**. Ahora el comprobante queda ahí mientras el ticket viaja, y
  sólo llega a `voided` cuando SUNAT lo confirma. Si lo rechaza, vuelve a
  `accepted`.

**Reloj**: no hay cron en Vercel, así que el disparador es el pull del POS (cada 2
minutos), más un botón manual en el ERP.

### La asimetría que hay que conocer

La devolución de stock y el movimiento de caja se hacen **cuando se envía el RA**,
no cuando el ticket vuelve aceptado. Es deliberado: la mercadería volvió
físicamente al almacén y el dinero salió del cajón en ese momento. Si SUNAT
rechaza el resumen, deshacer la devolución falsearía el inventario real, así que en
su lugar se notifica al módulo de comprobantes y el comprobante vuelve a
`accepted` para poder reintentar la baja.

### Cuatro defectos del `action: "void"`

1. **No comprobaba `invoice.status`.** Se podía anular dos veces el mismo
   comprobante: la segunda pasada volvía a incrementar el stock, volvía a crear la
   devolución en caja y quemaba un segundo correlativo de RA. Ahora sólo se anula
   lo que SUNAT aceptó, y cada estado rechazado explica por qué y qué hacer.
2. **El correlativo del RA se consumía aunque no se enviara nada.** El corte de la
   boleta —que no se anula por RA— vivía **dentro** del adapter, y para entonces ya
   se había pedido el correlativo y ya se había insertado la fila en
   `sunat_summaries`: cada intento de anular una boleta quemaba un identificador de
   resumen sin mandar un solo byte. El corte se movió al route.
3. **`voidBranchId` sin cadena de fallback.** Ver el punto 3.
4. El estado y los `sunat_summary_items`, ya descritos.

---

## 2. `voidInvoice()` del POS no tocaba SQLite

No hacía **ni un solo `invoke()`**: llamaba a la API y mutaba sólo Zustand. Al
reiniciar el POS el estado se perdía, el stock local no se devolvía y la devolución
no aparecía en la caja, así que el arqueo del terminal quedaba desalineado hasta el
pull siguiente. Y el `warning` que el ERP devuelve —«la devolución no se anotó en
caja porque no hay ninguna caja abierta»— nunca llegaba al cajero, porque
`fetchFactApi` lanza antes de poder leerlo.

**Comando Rust nuevo `void_invoice_local`**, transaccional, que hace la inversa
exacta de `insert_invoice`. Para eso se extrajo `apply_invoice_stock(conn, lines,
sign)`, que ahora usan los dos: emitir llama con el signo de `stock_sign()` y
anular con el signo invertido. El bucle de stock estaba dentro de `insert_invoice`
y no se podía comprobar.

Dos decisiones que no son obvias, y que están comentadas en el código:

- **La devolución local se inserta con `synced = 1`.** El ERP ya creó la fila
  autoritativa en `cash_register_movements`; con `synced = 0` el push siguiente la
  mandaría y habría **dos** devoluciones por la misma anulación. La fila local
  existe sólo para que el arqueo de esta caja cuadre sin esperar al pull.
- **Sólo se anota si la venta se cobró en efectivo.** Una devolución de una venta
  con tarjeta va por el adquirente y no toca el cajón: mismo criterio que
  `expected_cash_amount`.

El comando es **idempotente**: si el comprobante ya estaba `voided` o
`pending_void`, no repite la devolución. Reintentarlo es seguro, que es
precisamente lo que hace falta cuando la respuesta del servidor llegó pero la
escritura local falló.

**Tests**: de 21 a **27** en `cargo test`. Los seis nuevos cubren la reversión de un
compuesto (devuelve los insumos de la receta, no escribe el stock derivado), la de
un producto simple con decimales, la de una línea de insumo, que anular una ND no
mueve inventario, que anular una re-emisión tampoco, y que la devolución local no
se vuelve a empujar.

---

## 3. Once INSERT de `inventory_movements` que se perdían en silencio

`branch_id` es `NOT NULL` (`00001:508`), la sede se resolvía por una cadena de
fallbacks que podía acabar en `null`, y **once** INSERT no comprobaban el error. La
combinación es el peor modo de fallo posible: PostgREST rechaza con `23502`, nadie
mira, el movimiento se pierde y el stock sí se mueve (va por RPC aparte). O sea, el
saldo cambia y el kardex no lo explica.

En el camino de anulación pasaba con cualquier comprobante sin caja —un pago de
Culqi— porque `voidBranchId` no tenía ni fallback.

**`lib/inventory-movement.ts`** es ahora el punto único: resuelve la sede con la
cadena completa (caja → asignación del usuario → sede principal del tenant, con
orden determinista por `is_main` y luego antigüedad), **falla con un motivo legible**
si no hay ninguna, y devuelve el error en vez de tragárselo. No lanza: una emisión
ya tiene correlativo cuando se llega ahí, así que el fallo se acumula como aviso y
viaja de vuelta al POS; en una server action se devuelve como `warning`.

Migrados los once: `push/route.ts` ×3, `sunat/route.ts` ×3,
`actions/inventory-audits.ts`, `actions/products.ts` ×2, `actions/supplies.ts` ×2.
Y `actions/inventory-movements.ts`, que sí comprobaba el error pero forzaba
`branch_id` a `null` y por tanto fallaba siempre que el formulario no traía sede.

La migración 00041 corrige además una contradicción de `00001`: la columna era
`NOT NULL` **y** `ON DELETE SET NULL` a la vez. Las dos cosas no pueden ser
ciertas, así que el "SET NULL" nunca fue alcanzable. Ahora es `ON DELETE RESTRICT`,
que es la semántica real y la correcta: un movimiento histórico no puede quedarse
sin sede.

---

## 4. El dead-letter de SUNAT, ahora visible

`autoRetrySunat` filtra por `sunat_attempts < 5`, así que al quinto fallo el
comprobante **desaparece del bucle** y se queda en `issued` para siempre.
`sunat_attempts` no aparecía en ninguna pantalla del ERP y la página de
comprobantes no ofrecía «Reintentar»: el único rescate manual estaba en el POS, lo
que hacía depender la contabilidad de que un cajero abriera caja y se fijara en un
icono.

- `InvoiceListItem` y el `select` de `actions/ventas.ts` traen ahora
  `sunat_attempts` y `sunat_ticket_status`.
- La columna Estado muestra un badge **«Atascado»** con el número de intentos, y
  **«Ticket pendiente»** cuando hay una baja esperando respuesta.
- Acción **«Reintentar SUNAT»** por fila y **«Consultar estado de anulación»**
  cuando aplica, sobre dos server actions nuevas con `requirePermission`. No pasan
  por `/api/fact/sunat`, que exige un JWT de POS.
- Aviso en cabecera con el recuento y un botón «Consultar ahora», más un filtro
  **«Con problemas SUNAT»**.

El reintento manual **reinicia el contador a 0**: es una decisión humana, y dejarlo
al borde del tope haría que el bucle automático se rindiera al primer fallo.

---

## 5. Autorización offline en cuatro diálogos

`validatePin` va contra `/api/fact/validate-pin`. En un POS offline-first eso
significaba que **sin conexión no se podía dar una cortesía**, ni registrar una
merma, ni retirar efectivo, ni cerrar la caja. Y un gerente tenía que teclear su
propio PIN para autorizarse a sí mismo.

El patrón `isSelfAuthorized` ya estaba resuelto dos veces en el propio repo
(`cpe/void-auth-dialog.tsx` y `cpe/credit-note-dialog.tsx`). Replicado en:

| Diálogo | Cargos que autorizan |
|---|---|
| `pos/cortesia-dialog.tsx` | gerente, supervisor |
| `pos/stock-output-dialog.tsx` | gerente, supervisor, cajero |
| `caja/cash-movement-dialog.tsx` | gerente, supervisor |
| `caja/closing-step-confirm.tsx` | cualquiera con sesión |

El último merece una nota: ese gate **no comprobaba el cargo**, aceptaba cualquier
PIN válido, así que el propio cajero ya podía cerrar con su PIN. Autoautorizar al
usuario de la sesión es por tanto exactamente equivalente en permisos, no un
relajamiento; lo único que cambia es que deja de hacer falta conexión.

El detalle que no se puede omitir al copiar el patrón es el guard interno
`if (!isSelfAuthorized)` dentro del efecto del PIN: sin él, ese mismo efecto borra
el `pinValid = true` que acaba de poner el efecto de apertura.

**Y la cortesía ya deja rastro.** `cortesia-dialog` guardaba el nombre del
autorizador en estado de React sólo para pintarlo y llamaba a `applyCortesia` sin
él: regalar mercadería era la única operación autorizada del POS que no registraba
quién la autorizó. Ahora va a `authorization_log` vía
`lib/authorization-log.ts` — tabla que ya existía en el esquema local con
`self_authorized` y `synced`, y que sólo usaban las notas de crédito. Funciona sin
conexión y se sincroniza en el push. Lo mismo para la salida operativa.

**Lo que NO se hizo**, porque es funcionalidad nueva y no un arreglo: «cajero pide
PIN de supervisor sin conexión». La SQLite del POS no guarda usuarios ni PINs.

---

## 6. Las cortesías no llegaban a SUNAT

Éste no estaba en la lista y es el hallazgo más incómodo de la sesión.

`bilme-adapter.buildProductos` filtraba toda línea con `total === 0 &&
subtotal === 0`. Como `applyCortesia` pone `unit_price: 0`, **cada cortesía real se
caía del payload**: se imprimía en el ticket y no existía en el comprobante
electrónico. El ticket y el documento fiscal no coincidían. Y `reference_value` —el
valor referencial que SUNAT exige para una operación gratuita— se calculaba en
**tres sitios** del servidor sin que ningún consumidor lo leyera: la cadena estaba
construida entera y desconectada en el último eslabón.

Lo que exige SUNAT para una entrega sin contraprestación, verificado contra sus
anexos:

| Concepto | Valor |
|---|---|
| `cac:Price/cbc:PriceAmount` | **0** — no se cobró nada |
| `cac:AlternativeConditionPrice` + `cbc:PriceTypeCode` | valor referencial + **`02`** (catálogo 16: "valor referencial unitario en operaciones no onerosas") |
| `cbc:LineExtensionAmount` | valor referencial sin IGV × cantidad |
| Tributo | **9996** (GRA / FRE), no 1000 |
| Catálogo 07 | código de **gratuidad**: `15` gravado (bonificaciones), `21` exonerado, `37` inafecto |

El POS mandaba `tax_type: "inafecto"`, que es el código **30** — *inafecto operación
onerosa*, que es otra cosa.

**Está implementado y APAGADO por defecto**, con el interruptor
`fact_config.emit_free_lines` (migración 00041). El motivo es serio: hoy la boleta
con cortesía se **acepta** precisamente porque la línea desaparece y los totales
cuadran. Al declararla como gratuita, SUNAT exige además el total de venta gratuita
del comprobante, y la documentación de Billme lista nueve campos en `totales` y
**ninguno** de venta gratuita. Encenderlo sin comprobarlo contra la API real podría
convertir una boleta que hoy se acepta en un rechazo completo.

**Procedimiento para encenderlo** (en `facturacion-billme.md`): emitir en beta con
el token de desarrollo una boleta con línea gratuita, descomprimir el `cdrBase64` y
comprobar `ResponseCode 0` y que el XML lleve `AlternativeConditionPrice` con
`PriceTypeCode 02`. Sólo entonces el `UPDATE`.

El valor referencial sale de `lib/sunat/reference-values.ts`, ahora único:
`supplies.cost_price` para un adicional, `invoice_items.original_unit_price` para
una cortesía — que es el caso mejor, porque el precio que se regaló ES el valor de
la operación.

---

## 7. La pestaña «Adicionales» y el bug de promociones

`addSupplyItem` no tenía **ni un llamador**: `handleSupplyClick` abría siempre el
diálogo de salida operativa. Confirmado contra la base: 0 `invoice_items` con
`supply_id` en toda la historia.

Ahora el clic ofrece las dos operaciones, que son distintas: **«Añadir al
comprobante»** (línea gratuita del ticket) y **«Salida operativa»** (merma, consumo
de staff, rotura).

Y el bug latente, que era real:

- `addSupplyItem`, `applyCortesia` y `removeCortesia` **no llamaban a
  `recalcPromotion`**, a diferencia de `addItem`/`removeItem`/`updateQuantity`. Se
  extrajo `withRecalculatedPromotion`, que estaba copiado en tres sitios, y ahora
  lo usan los seis.
- `recalcPromotion` sólo excluía los adicionales cuando `applies_to` era
  exactamente `"products"` o `"services"`. Con cualquier otro valor —`"all"`, que es
  el **default del esquema**— entraban en `applicableQty`, que suma **unidades sin
  ponderar por precio**: un regalo podía cruzar el `min_quantity` o, en modo
  `applies_every`, sumar un grupo entero de descuento. Es decir, **regalar algo
  abarataba el resto del ticket**. Ahora las líneas gratuitas quedan fuera siempre,
  aquí y en el espejo de `applyPromoCode`.
- `addSupplyItem` rechazaba en silencio por stock; ahora dice el motivo.
- `CartItem.product_id` pasa a `string | null`. `addSupplyItem` metía ahí el id del
  **insumo**, lo que obligaba a `create-invoice` a anularlo a mano y hacía que el
  filtro por etiquetas comparara un insumo contra asignaciones de producto.

---

## 8. Validación del RUC del emisor

No había ninguna: `validators/fact-config.ts` era un `regex(/^\d{11}$/)` sin
prefijo ni dígito verificador. Billme **no valida el RUC del emisor** — verificado,
aceptó una boleta con un RUC ajeno en desarrollo—, así que un RUC mal formado pasaba
en homologación y salía rechazado en producción con el correlativo ya consumido.

El checksum módulo 11 correcto existía, muerto, en
`kronos-fact/src/lib/invoicing/ruc-validator.ts`. `CLAUDE.md` afirmaba que el
proyecto validaba el RUC; era falso, no lo llamaba nadie.

Movido a `poi-erp/src/lib/sunat/ruc.ts` y enganchado en tres sitios: el validador
Zod (único punto de escritura) y los dos caminos de emisión, para los datos que ya
estaban guardados. Contrastado con RUCs reales: el de POI (20613509446), el de los
ejemplos de Billme (20607599727) y uno público conocido (20100070970) pasan;
alterar el último dígito o el prefijo los rechaza.

---

## 9. Menores y limpieza

- **`autoRetrySunat` perdía `supply_id`** frente al retry manual y al push: eran
  tres copias del mismo bloque y una había divergido. Se unificó en
  `lib/sunat/reference-values.ts`, y la reconstrucción completa del envío en
  **`lib/sunat/resubmit.ts`**, que ahora usan el auto-retry del pull y el botón del
  ERP. El auto-retry además resolvía la referencia de la nota **sin filtrar por tipo
  de documento**: `reference_invoice_id` lo usa también una re-emisión, y rellenar
  `tipoComprobanteRef` en una boleta normal la convierte ante SUNAT en algo que no
  es.
- **`types/database.ts` podado** de 432 líneas y 36 tipos a los **tres** que el
  código importa (`Cargo`, `Profile`, `Tenant`). No es un fichero generado —no
  existe script `db:types`— e iba 37 migraciones por detrás: declaraba
  `invoices.branch_id`, exactamente la columna del bug del webhook de Culqi.
- **Código muerto borrado**: `tax-calculator.ts`, `commands/invoke.ts`,
  `lib/sunat/apisunat.ts` (shim legacy), `ruc-validator.ts` (tras rescatar el
  checksum), `pages/sales.tsx` y su ruta `/ventas` (mock estático de 44 líneas al
  que nada enlazaba), y `sync_commands.rs` con su registro en `lib.rs` y
  `commands/mod.rs` (sin terminar, con dos `// TODO`, y sus únicos llamadores TS
  estaban en `invoke.ts`, que no tenía importadores).
- **`void-auth-dialog.tsx` se conserva a propósito**, con el porqué escrito en el
  fichero: es el molde del patrón `isSelfAuthorized` y la anulación directa vuelve
  en cuanto exista el Resumen Diario con ítem en estado 3.

---

## Tres defectos que encontró la propia verificación

Las pruebas no confirmaron lo escrito: encontraron cosas.

### 1. `\b98\b` casaba con un importe

`isTicketInProgress` reconocía «en proceso» también por el código 98, con
`/\b98\b/`. El punto decimal es un límite de palabra, así que **`"monto 0.98"`
casaba**. Un resumen ACEPTADO cuya descripción llevara un importe terminado en 98
se habría leído como «en proceso», se habría seguido consultando hasta agotar
`poll_attempts` y habría acabado marcado `failed` — dejando en `pending_void` un
comprobante que SUNAT sí dio de baja. Exactamente el error que el orden de
precedencia de `checkTicket` pretende evitar, cometido por el otro lado.

Ahora se exige un 98 con **forma de código**: no pegado a otro dígito ni a un
separador decimal. `"98"`, `"statusCode 98"` y `"código: 98"` casan; `"0.98"`,
`"980"`, `"1980"` y `"1,98"` no.

### 2. Las notificaciones desde API routes nunca se insertaban

`notifyModuleAction` usaba siempre el cliente con cookies. **Todas** las policies de
`notifications`, `profiles` y `user_permissions` son `TO authenticated` y no hay
ninguna para `anon`, así que desde una API route —donde no hay cookie de sesión de
Supabase— `getModuleUsers` devolvía lista vacía y RLS bloqueaba el INSERT. La
notificación no fallaba ruidosamente: **no llegaba a existir**.

Lo sufrían tres llamadores, dos de ellos anteriores a esta sesión:

| Llamador | Estado |
|---|---|
| Sobreventa en `/api/fact/sync/push` | roto desde que se escribió (00040) |
| `notifyLowStockPush` — su propio comentario dice "called from API routes" | roto |
| Rechazo del ticket en `poll-summaries` | lo habría estado |

Confirmado contra la base: las 9 notificaciones de las últimas horas vienen todas de
**server actions** con sesión de navegador (usuario creado, servicio creado, cajero
asignado). No hay ni una originada en una API route en toda la tabla.

Arreglado con `asSystem: true`, que usa el cliente admin. Y de paso: un `actorId`
vacío o `"system"` —lo que pasaban `notifyLowStockPush` y el webhook de Culqi— es un
uuid inválido que **reventaba el INSERT completo con 22P02**, así que se perdían
también las notificaciones de los demás destinatarios.

### 3. `isFreeLine` / `isDroppedLine` no eran exportables

Se exportan ahora, por el mismo motivo que `extractDigestValue` y
`normalizeFaultCode`: son decisiones que hay que poder comprobar sin levantar media
aplicación.

---

## Un comprobante atascado apareció solo, en producción, durante la prueba

A las **15:36:45 UTC del 2026-08-09**, mientras se verificaba la UI, el POS empujó
una boleta real de **S/ 1.00** (`B001-00000307`). SUNAT la rechazó con el mensaje ya
conocido —*«Esta empresa no tiene autorización para emitir documentos en el entorno
de producción»*— y los reintentos la dejaron en `sunat_attempts = 6`.

Con eso cruzó el umbral y **quedó invisible en el ERP desplegado**: `autoRetrySunat`
filtra `status = 'issued'` y ella está en `rejected`, así que el bucle automático no
la mira; y sin la superficie nueva, la página de comprobantes no tenía dónde
mostrarla ni forma de reenviarla.

No hizo falta inventar el escenario del dead-letter: ocurrió por su cuenta el mismo
día, y la UI nueva lo detectó y lo ofreció resolver. También es el recordatorio de
que el bloqueante de negocio es real y está activo: hoy cada emisión se rechaza.

---

## Evidencia ejecutada

### Baterías de lógica (scratchpad, con Supabase y `fetch` sustituidos)

Se comprueba lo que la UI no puede alcanzar: los estados del ticket sólo se recorren
cuando SUNAT responde, y en producción no hay ni un resumen pendiente.

| Batería | Qué cubre | Resultado |
|---|---|---|
| `logic-suite` | checksum del RUC (incluidas las ramas `remainder 10/11`), catálogos 07/05/16, detección de línea gratuita con el interruptor en los dos estados, mapeo de «en proceso», valor referencial, aritmética del IGV referencial | **90 / 90** |
| `poller-suite` | payload de `ConsultarEstadoTicket`, precedencia del veredicto (fault > en proceso > CDR > pending), archivado del CDR, las cuatro ramas del poller (aceptado, rechazado, en proceso, tope agotado), cortes tempranos, fallo del UPDATE | **50 / 50** |
| `schema-suite` | `factConfigSchema` real, el que corre el resolver del formulario | **13 / 13** |
| `movement-suite` | cadena de resolución de sede, caché, sede explícita, fallo legible sin sede, propagación del error del INSERT | **23 / 23** |

Un detalle de método: el formulario de configuración valida en submit, así que
comprobar el RUC desde el navegador habría exigido **enviar el formulario contra la
base de producción con un POS vendiendo**. Eso no es una prueba, es un riesgo: se
comprobó el mismo `factConfigSchema.safeParse` que usa el resolver.

### UI real, con Playwright

Contra el servidor de desarrollo apuntando a producción, **sin una sola escritura**:

- La página de comprobantes carga sin errores ni avisos de consola.
- El filtro «Con problemas SUNAT» —la cadena `or(and(sunat_attempts.gte.5,status.in.(…)),sunat_ticket_status.eq.pending)`,
  que es la sintaxis de PostgREST más frágil que se escribió— parsea y **selecciona
  exactamente el único comprobante problemático de los 279**. Es reversible.
- Badges: `Atascado` con 5 y con 7 intentos, **no** con 4 (la frontera), `Ticket
  pendiente` sólo con el ticket en `pending` y no con `completed` ni `failed`.
- `Anulación pendiente` se pinta: era el estado que llevaba desde la migración 00001
  en el CHECK, con badge en la UI, y que nadie escribía.
- Banner con recuento y concordancia correcta en singular y plural.
- «Reintentar SUNAT» aparece en `issued`/`rejected`/`sent_to_sunat` y **no** en
  `accepted`, `voided` ni `pending_void`; la etiqueta lleva el nº de intentos.
- «Consultar estado de anulación» aparece **sólo** con ticket pendiente.
- Las dos acciones ejecutadas de verdad: `Reenviando a SUNAT… → Comprobante no
  encontrado` (guard de no-encontrado, sin escritura ni llamada a SUNAT) y
  `Consultando SUNAT… → No hay anulaciones esperando respuesta de SUNAT`
  (server action + permiso + poller + corte temprano).
- Todas las server actions responden 200; ninguna excepción en el log.
- El instalador se descarga: HTTP 200, 4 184 872 bytes, cabecera `MZ` — binario, no
  el HTML de login. Es la comprobación del matcher de `middleware.ts` que ya falló
  una vez.
- Las seis páginas cuyas acciones se tocaron siguen respondiendo 200.

Los estados que producción no tiene (`pending_void`, atascados sintéticos) se
alcanzaron con un andamio temporal en `getInvoices` tras `POI_UI_FIXTURES`, retirado
al terminar y verificado por `grep` y `git status`.

Y se comprobó al cerrar que la sesión **no escribió nada**: 0 resúmenes, 0
`sunat_summary_items`, 0 movimientos de inventario nuevos, `fact_config` sin tocar
desde el día anterior, y `B001-00000307` con los mismos 6 intentos que tenía.

```
kronos-fact/src-tauri $ cargo test
    test result: ok. 27 passed; 0 failed        (eran 21)

kronos-fact $ npx tsc -b --force
    exit 0

kronos-fact $ npm run build
    ✓ built in 26.62s

poi-erp $ npx tsc --noEmit
    sin errores (salvo los preexistentes de `pg` en e2e/, sin @types/pg)

poi-erp $ npm run build
    compilado, 40+ rutas generadas

poi-erp $ npm run lint
    115 problemas: 58 errores, 57 avisos
    (la línea base ANTES de esta sesión era 118: 60 errores, 58 avisos —
     el lint del proyecto ya estaba en rojo y queda algo mejor)
```

### Migración 00041 y despliegue — HECHOS el 2026-08-09

**El orden importaba y no era el habitual de esta casa.** Las migraciones anteriores
eran puramente aditivas y el código viejo las ignoraba, así que daba igual el orden.
Ésta **no**: el código nuevo hace `select(... emit_free_lines)` sobre `fact_config`, y
contra una base sin esa columna PostgREST responde `42703` y rechaza la consulta
entera. Se aplicó primero y se desplegó después, que es el orden correcto.

Estado verificado tras aplicarla:

```
sunat_summary_items            → existe (3 columnas, PK compuesta, índice por invoice_id, 1 policy)
sunat_summaries.poll_attempts  → existe, NOT NULL DEFAULT 0
fn_increment_summary_polls     → existe
fact_config.emit_free_lines    → existe, false
inventory_movements_branch_id_fkey → confdeltype 'r' (RESTRICT; antes 'n' = SET NULL)
```

**Desplegado a producción** vía PR #2 (`578a154`), mergeado a las 16:39 UTC. El PR #1
había llevado antes `ffc9519`, el commit de multi-POS de la sesión anterior que
seguía sin desplegar.

Comprobado contra `erp.peruonice.com`, no asumido:

| Señal | Resultado |
|---|---|
| `POI-Fact-Setup-v1.0.3.exe` | HTTP 200, 4 184 872 bytes, `application/x-msdos-program` |
| `POST /api/fact/{sunat,sync/pull,sync/push}` | **401**, no 500 → los módulos nuevos cargan |
| Páginas del ERP sin sesión | 307 a login, ninguna 500 |
| `/login` | 200 en 0,65 s |
| `B001-00000307` en la UI real | «Rechazado \| Atascado», con banner y filtro |

El instalador es la señal fuerte: ese fichero no existía en `main` antes del merge, así
que un 200 con esos bytes exactos prueba de una vez que Vercel construyó el commit
nuevo, que el binario viajó, y que el matcher de `middleware.ts` sigue excluyendo
`.exe` en vez de servir el HTML de login — que es el fallo que ya ocurrió una vez.

---

## Lo que queda, con el diseño ya hecho

En `docs/pendiente-notas-y-multipos.md`. Por orden de urgencia:

1. **El alta en producción del proveedor** — el bloqueante real, y no es código.
   `fact_config` sigue con `provider = apisunat`, `is_production = true` y
   `detraction_account = NULL`.
2. **Verificar la línea gratuita** contra Billme beta y encender `emit_free_lines`.
3. **Stock por sede** (ADR 0001) — la ventana de migración trivial se cierra el día
   que abra la segunda sede.
4. **Cerrar el canal de realtime** — ahora se sabe que es viable: `/api/fact/auth`
   firma un JWT de Supabase real, así que `setAuth` funciona tal cual.
5. **El PAT de GitHub embebido** en la URL del remoto de `poi-erp`.
6. **Autorización offline tras reiniciar el POS** — el `auth-store` no persiste y el
   login por PIN es online.
