# Pendiente

Investigado y verificado. Ordenado por gravedad. Actualizado el **2026-08-09**,
tercera tanda, tras el corte del proveedor de facturación a **Billme producción**.

---

# ⚡ Lee esto primero si abres una sesión nueva

## ¿Sirve lo que hay para producción?

**Sí para boletas y facturas, en cuanto se corrija una contraseña. Con matices en
el resto.** Honestamente, por vía:

| Vía | ¿Lista? | Detalle |
|---|---|---|
| **Boleta** | ✅ sí, tras la Clave SOL | Toda la cadena verificada: certificado, payload, firma, usuario y permisos |
| **Factura** | ✅ sí, tras la Clave SOL | Ídem |
| **NC / ND** | ⚠️ probablemente | El payload **coincide campo a campo** con la doc oficial, pero **nunca se ha enviado uno a SUNAT**: `BC01`, `FC01`, `BD01` y `FD01` están todas en correlativo 0. La primera será una prueba en vivo |
| **Factura con detracción (SPOT)** | ❌ no | `fact_config.detraction_account` está en **NULL**. La primera se rechaza. Es un dato, no código |
| **Cortesías / adicionales** | ⚠️ fuera del XML a propósito | Salen en el ticket impreso y **no** en el comprobante electrónico. Es el comportamiento histórico, ahora consciente y con interruptor. Ver punto 1 |
| **Anular boleta** | ⚠️ sólo por NC motivo 01 | Con Billme no hay otra vía: su contrato del Resumen Diario no tiene campo de estado de ítem. Es válido y síncrono, pero tampoco se ha ejercitado |

**Lo único que bloquea de verdad hoy es la Clave SOL del panel de Billme.** Todo lo
demás de arriba, o funciona, o es un dato que falta, o es una decisión de negocio.

## Qué pasó en la sesión del 2026-08-09 (tercera tanda)

El objetivo era «que se pueda emitir ya en producción». Se recorrió **entera** la
cadena de autenticación de SUNAT y se quedó en el último escalón.

**El hallazgo que reordenó todo**: el proveedor activo era `apisunat`, no Billme.
Todo el trabajo de líneas gratuitas de la tanda anterior vivía en el adapter de
Billme, y el de apisunat descarta las líneas de importe cero sin excepción — o sea
que `emit_free_lines` era un **no-op en producción** todo el tiempo que estuvo
documentado como pendiente.

Se cambió el proveedor a Billme producción y se recorrieron, uno a uno:

| Código | Qué decía | Qué se tocó |
|---|---|---|
| `0103` | El usuario SOL no existe | Se creó el usuario secundario en SUNAT |
| `0110` | No se pudo obtener el tipo de usuario | Le faltaba el perfil de facturación electrónica |
| `0104` / `0102` | Clave incorrecta | ← **aquí seguimos** |

Lo que **sí** estaba bien y se comprobó en vez de suponerse: el certificado digital
(extraído del XML firmado — RENIEC, `PERU ON ICE S.A.C.`, vigente a 2029), los
payloads de boleta/factura/NC/ND/RA contra la documentación oficial campo a campo, y
la firma del UBL.

Tres cosas que se aprendieron y que **no están escritas en ninguna documentación**:

1. **Billme antepone el RUC al Usuario SOL.** En su campo va el usuario secundario a
   secas. Escribir `20613509446MIUSUARIO` produce un RUC duplicado y **el mismo
   `0103` que un usuario inexistente**, así que parece un problema de SUNAT cuando es
   de formato.
2. **Autenticar no es poder emitir.** `ConsultarCdr` respondía `0127` (autenticación
   correcta) mientras la emisión devolvía `0110`. Esa asimetría entre los dos
   endpoints es lo que señaló que faltaba el permiso de envío y no la credencial.
3. **El `0140` despista.** *"Existe un documento igual en proceso"* es un bloqueo
   **por documento** que SUNAT aplica ANTES de comprobar el permiso de envío.
   Reintentar el mismo comprobante lo devuelve en bucle y parece que la
   autenticación ya funciona. Hizo falta emitir un correlativo virgen para
   desenmascararlo.

**`ConsultarCdr` es la sonda**: autentica con las mismas credenciales que el envío
pero no emite nada, así que se puede repetir todas las veces que haga falta mientras
se ajusta el panel. En el ERP es el botón «Verificar» de Configuración › POI Fact.

## Qué se cambió en el código

Todo desplegado y verificado en producción. PRs **#4**, **#5** y **#6** mergeados;
el **#3** quedó cerrado, absorbido por el #4.

**`poi-erp`**

- **`src/lib/sunat/policy.ts` (nuevo)** — módulo puro, sin dependencias, para que lo
  importen tanto el servidor como los componentes cliente. Reúne el plazo legal,
  `MAX_SUNAT_ATTEMPTS` (que estaba copiado a mano en un componente), los códigos de
  credenciales con su remedio concreto por código, y los fallos sistémicos.
- **Plazo legal de envío**: 3 días calendario para serie `F`, 7 para `B`, desde el
  día siguiente a la emisión. Se decide por el **prefijo de la serie**, no por
  `document_type`. La tabla que había en la UI se equivocaba en tres casos.
  Guardarraíl en los tres caminos de reenvío y badge «Fuera de plazo».
- **Auto-reemisión de fallos sistémicos** — el cambio que más importa para el día
  del desbloqueo: un rechazo por credenciales del emisor **ya no consume el
  presupuesto de reintentos del comprobante**, porque ese contador mide fallos del
  documento y esto no lo es. `autoRetrySunat` recoge también los `rejected`
  sistémicos, con enfriamiento de 30 min. **El primer pull del POS tras arreglar la
  clave emite todo lo pendiente solo.**
- **El botón «Verificar» daba verde mientras SUNAT rechazaba al emisor** — sólo
  miraba el código HTTP. Y el arreglo traía su propio bug: la extracción del código
  partía por el punto, y Billme usa `a:Client.0103` al emitir y `ns0:0103` al
  consultar, así que la sonda pasaba justo el caso que venía a detectar.
- Banner en la página de comprobantes con el remedio concreto, interruptor de
  `emit_free_lines` en la UI (**sigue apagado**), eliminado el fallback
  `correlative: 1` del Resumen de Bajas, y tipos de Supabase generados
  (`npm run db:types` → `src/types/supabase.ts`, 3.945 líneas).

**`kronos-fact` 1.0.4** — el POS estaba ciego ante un rechazo: el motivo llegaba del
ERP, se escribía en su SQLite y **nunca se volvía a leer** (faltaba la columna en el
`SELECT` de `get_invoices_by_date`). El cajero veía «Rechazado» y nada más. Y el
botón de envío masivo hacía `catch { failed++ }`, tirando todos los motivos justo
cuando fallan varios a la vez. Compilado, publicado y con el SHA-256 servido
idéntico al compilado.

**`poi-lector`** — el PWA **no era instalable**: el manifiesto declaraba
`poi-logo.png` como 192×192, 512×512 y maskable, y ese fichero mide 72×60. Chrome
exige 192 px reales. Se generaron los tres iconos de verdad.

## Lo que hay que hacer, por orden

1. **Corregir la Clave SOL** en el panel de Billme (punto 0). Recomendación:
   cambiarla en SUNAT por una **alfanumérica de 8–12 caracteres, sin símbolos, sin
   `ñ` ni tildes**, y ponerla en Billme tecleada a mano. Eso descarta a la vez las
   dos causas que quedan: que lleve caracteres que se rompen dentro del XML de
   WS-Security (falla por API y funciona en el portal — el síntoma exacto) y que sea
   la del usuario principal en vez de la del secundario.
2. **Rellenar `detraction_account`** — la cuenta del Banco de la Nación, desde
   Configuración › POI Fact. Sin ella la primera factura con SPOT se rechaza.
3. **Decidir qué hacer con los 7 comprobantes fuera de plazo** (S/ 9 766). Contable,
   no técnico.
4. **Rotar dos contraseñas** (punto 4) — estuvieron en un repositorio público.
5. **Stock por sede** (punto 2) — la única cuya ventana se cierra sola.

## Cómo emitir en cuanto la clave esté bien

Los scripts quedaron escritos en el scratchpad de la sesión. Si ya no existen, lo
que hacen es trivial de rehacer: cargar `.env.local`, llamar a `resubmitInvoice()`
de `lib/sunat/resubmit` con el `invoice_id`, y volcar la respuesta.

Comprobantes esperando: `B001-00000307` (boleta real de cliente, S/ 1.00, en plazo
hasta el 16-ago) y `B002-00000001` (S/ 1.00, creada en esta sesión como prueba del
corte). **Con el auto-reenvío nuevo, las dos salen solas en el primer pull del POS**
— no hace falta ejecutar nada.

---

> **Ya resuelto en `notas-de-credito-y-debito.md`**: la re-emisión que cobraba dos
> veces, la matriz única de efectos por motivo, el motivo 08, la prohibición de
> descuentos y bonificaciones sobre boleta, el subtipo "cantidad" de la ND 02 que
> restaba stock, el arqueo que descuadraba con tarjeta, la apertura sintética de
> la anulación y los arqueos de cierre duplicados.
>
> **Resuelto el 2026-08-08**: credenciales versionadas (1), series propias por caja
> y correlativo impreso (5), el correlativo diario del RA (parte de 2), el webhook
> de Culqi que perdía todos los comprobantes de pago online, el **punto 3 entero**
> (multi-POS), el defecto P0 de stock local que lo bloqueaba, el read-modify-write
> de `createInventoryMovement` y la UX del botón «Anular».
>
> **Resuelto el 2026-08-09** (migración `00041`, ver
> `docs/historial/2026-08-09-ciclo-asincrono-de-anulacion.md`): el **punto 2
> entero** (polling del ticket, `voidInvoice` revirtiendo SQLite, validación del RUC
> del emisor, `supply_id` del auto-retry), el **punto 6 entero** (los cuatro
> diálogos que exigían red, la línea de insumo, el bug de promociones), el **punto 7
> entero** (los 11 INSERT sin comprobar, el dead-letter con UI, `types/database.ts`,
> el código muerto) y un defecto que no estaba en la lista: **las cortesías no
> llegaban a SUNAT**.

---

## 0. Lo único que bloquea la emisión: la Clave SOL

**Nada se ha emitido nunca a la SUNAT real.** Todo lo que figura como `accepted`
salió contra el sandbox de apisunat. El 2026-08-09 se cambió el proveedor a
**Billme producción** y se recorrió entera la cadena de autenticación de SUNAT.
Hoy queda **un solo escalón**:

| Pieza | Estado |
|---|---|
| Token de Billme | ✅ válido, ambiente **producción** verificado |
| Certificado digital (CDT) | ✅ real y vigente — RENIEC, `PERU ON ICE S.A.C.`, `NTRPE-20613509446`, 2026-08-07 → 2029-08-06 |
| Payload de boleta, factura, NC, ND y RA | ✅ coincide campo a campo con la doc oficial de Billme |
| Firma del UBL | ✅ Billme devuelve el XML firmado con `DigestValue` válido |
| Usuario SOL | ✅ existe y tiene los permisos de envío |
| **Clave SOL** | ❌ `0104` al consultar y `0102` al emitir — las dos formas de decir "la contraseña no coincide" |

La cadena recorrida, con la causa de cada código, está documentada en
`facturacion-billme.md`: `0103` (usuario inexistente) → `0110` (sin perfil de
envío) → `0104`/`0102` (clave). El diagnóstico se hace **sin emitir nada** con
`ConsultarCdr`, que autentica con las mismas credenciales; si responde `0127`, la
autenticación pasó. En el ERP es el botón «Verificar» de Configuración › POI Fact.

### Dónde vive el token, que no es donde parece

`fact_config.api_token`, una columna de la base — **no es una variable de entorno**
y no hay nada que configurar en Vercel. Se cambia desde Configuración › POI Fact sin
volver a desplegar. Estado a 2026-08-09: 64 caracteres, `provider = bilme`,
`is_production = true`, verificado como ambiente de producción.

### Qué queda por descartar en la clave

Dos causas, y una sola acción las cubre. **Cambiar la contraseña del usuario
secundario en SUNAT por una alfanumérica de 8–12 caracteres, sin símbolos, sin `ñ`
ni tildes**, y ponerla en Billme tecleada a mano (no pegada: un espacio final del
portapapeles da este mismo error).

1. **Caracteres que se rompen en el camino.** Billme mete la contraseña dentro de
   una cabecera XML de WS-Security. Si lleva `&`, `<`, `>`, comillas, `ñ` o tildes y
   el proveedor no las escapa, SUNAT recibe una cadena distinta. El síntoma es
   exactamente el observado: **entra bien por el portal de SUNAT y falla por la
   API**, porque el portal no pasa por ese XML.
2. **Que sea la clave del usuario principal** en vez de la del secundario. «Clave
   SOL» se llama igual en los dos sitios y el campo de Billme quiere la del
   secundario.

**Cuando la clave sea correcta no hay que hacer nada más**: `autoRetrySunat`
reenvía solo los rechazos por causa sistémica, así que el primer pull del POS
emite todo lo pendiente.

**`fact_config.detraction_account` sigue en NULL**: la primera factura con SPOT se
rechazaría. Es el otro dato de gestión que falta.

### Comprobantes en problemas, medidos

Nueve comprobantes en estado no terminal, por **S/ 9,766**. No son el mismo caso y
la diferencia importa:

| Grupo | Documentos | Importe | Situación |
|---|---|---|---|
| **Recuperables** | `B001-00000307`, `B002-00000001` | S/ 2 | En plazo hasta el 16-ago. Se emitirán solos al arreglar la clave |
| **Fuera de plazo, nunca llegaron a SUNAT** | `F001-00001249` (S/ 7 450), `F001-00000359`, `F001-00000090`, `F001-00000087`, `B001-00000302`, `B001-00000303` | S/ 9 066 | 4–6 de mayo. Rechazados por apisunat con *"no tiene autorización… producción"* |
| **Fuera de plazo, pero probablemente sí existe** | `B001-00000065` | S/ 700 | Su rechazo dice *"La boleta B001-65 fue emitido anteriormente"* — o sea que llegó a SUNAT en su día |

Los siete de las dos últimas filas **ya no se reintentan** —ni desde el pull, ni
desde el ERP, ni desde el POS— y salen marcados «Fuera de plazo»: SUNAT los
rechazaría con el código 2600 y ya perdieron la calidad de comprobante de pago.
**Qué hacer con ellos es una decisión contable, no técnica**, y la de S/ 7 450 fue
a un cliente con RUC que no ha podido usar su crédito fiscal.

`B002-00000001` la creó esta sesión, a propósito: `B001-00000307` estaba atrapado
en el bloqueo `0140` de SUNAT —que es por documento— y hacía falta un correlativo
virgen para saber si el envío funcionaba de verdad. Se emitirá como prueba del
corte.

---

## 1. Encender las líneas gratuitas — un paso, con sonda previa

**El código está completo y APAGADO**, tras el interruptor
`fact_config.emit_free_lines` (migración 00041, default `false`).

Qué hay implementado: `buildProductos` del adapter de Billme deja de descartar la
línea de importe cero cuando trae valor referencial, y la emite como operación
gratuita — `precioUnitario: 0`, el valor referencial en `precioLista` con
`codigoTipoPrecio: "02"` (catálogo 16), tributo 9996 (GRA) y código de gratuidad del
catálogo 07 según la afectación del bien (15 gravado / 21 exonerado / 37 inafecto).

**Por qué está apagado, ahora contra la fuente primaria.** Se leyó entera la
documentación oficial de Billme (`quinodevelop.gitbook.io/billme`) el 2026-08-09, y
confirma lo que se temía:

- el bloque `totales` tiene **exactamente nueve campos** y **ninguno de venta
  gratuita**, ni en boleta/factura ni en las notas (que llevan cinco);
- **no existe bloque de leyendas** en ningún tipo de documento.

SUNAT exige las dos cosas para una operación gratuita: la leyenda **1002**
(*"TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE"*,
catálogo 52) y el *Total valor de venta – Operaciones gratuitas* mayor que cero.
Sin ellos rechaza con **2416** (*"Si existe leyenda Transferencia Gratuita debe
consignar Total Valor de Venta de Operaciones Gratuitas"*) y **2641** (*"Operación
gratuita, debe consignar Total valor venta - operaciones gratuitas mayor a cero"*).

Cabe que Billme los derive del array `productos` al construir el UBL — no lo
documenta, y es exactamente lo que hay que averiguar. Hoy una boleta con cortesía
se **acepta** precisamente porque la línea desaparece del payload y los totales
cuadran, así que encenderlo a ciegas puede convertir una boleta que hoy pasa en un
rechazo completo. El modo de fallo es la vía de venta principal.

**Trampa adicional detectada en el catálogo de Billme**: su lista de afectación del
IGV salta del 36 al 40, **sin el 37** (*Inafecto – Transferencia gratuita*), que
SUNAT sí tiene. `mapCodigoAfectacionGratuita` emite 37 para una cortesía inafecta.
Hoy no salta porque el POS manda todas las cortesías como `gravado` → 15, que sí
está en su lista.

**La sonda está escrita y lista**: 13 casos (boleta, factura, NC de cuatro motivos,
ND, detracción, cortesías, RA y consulta de ticket) que importan el adapter real e
interceptan `fetch` para volcar petición, respuesta, CDR descomprimido y XML
decodificado. Sólo falta **un token de DESARROLLO de Billme**; el que había en
`env.txt` está muerto («El token no es válido»). Se crea registrando una empresa de
tipo "Desarrollo" en su panel, donde los datos pueden ser ficticios y ellos mismos
recomiendan `MODDATOS` como usuario y clave SOL.

Criterio de aceptación de la sonda, en el XML que devuelva Billme:

1. `faultCode` vacío y `cdrBase64` presente;
2. el CDR descomprimido con `ResponseCode 0`;
3. `<cbc:Note languageLocaleID="1002">` presente;
4. un `cac:TaxSubtotal` con `TaxScheme/ID = 9996` y `TaxableAmount > 0`;
5. la línea con `cac:AlternativeConditionPrice` y `cbc:PriceTypeCode` `02`.

Si falta 3 o 4, **no forzarlo**: documentar el hueco y preguntar al proveedor.

Sólo con eso pasado se enciende — y ya no hace falta SQL, hay interruptor en
Configuración › POI Fact.

Mientras esté apagado, el comportamiento es el histórico: la cortesía sale en el
ticket impreso y no en el comprobante electrónico. **Eso ya era así**, no es una
regresión — pero ahora está sabido y tiene arreglo listo.

### Cuánto importa, con números

Sondeado el 2026-08-09: hay **17 líneas de cortesía** en la base, S/ 685 de valor
regalado. Repartidas así:

| | Líneas | Cuándo |
|---|---|---|
| Emisiones **reales** que fueron a SUNAT | **1** | 2026-03-27 |
| Registros históricos cargados a mano (nunca fueron a SUNAT) | 16 | marzo 2026 |

O sea: la exposición retroactiva es **un solo documento**, y encima contra el sandbox
de apisunat, no contra producción. Prácticamente nula.

Lo que importa es hacia delante: **la cortesía es una práctica operativa real** —17
usos en el histórico—, así que cada una que se dé a partir de ahora tendrá el ticket
impreso y el XML discrepando, hasta que la sonda pase y se encienda el interruptor.
No es urgente mientras la empresa siga sin poder emitir en producción; sí lo es el día
que se resuelva el punto 0.

De adicionales (`invoice_items` con `supply_id`) sigue habiendo **0**: la vía se
conectó hoy y nadie la ha usado todavía.

---

## 2. Stock por sede — bloqueante para el multi-sede

**ADR escrito, cero código**: `docs/adr/0001-stock-por-sede.md`.

**No existe stock por sede.** `products.stock_quantity` es un único número por
tenant y el pull baja **todos** los productos sin filtrar por `branch_id`;
`get_products` en la SQLite del POS tampoco filtra. La columna `products.branch_id`
existe y está poblada en 31 de 41 filas, pero **no segmenta stock en ningún punto**.

Con varias sedes: **vender en la sede A baja el stock que ve la sede B.** El
inventario valorizado y el kardex mezclan almacenes, y `inventory_audits` —que sí
tiene `branch_id`— audita contra un número que no es de ninguna sede.

El ADR recomienda una tabla `branch_stock` (no filas de producto por sede) y
enumera el arrastre en nueve frentes: RPC con `p_branch_id`, compuestos por sede,
pull filtrado, broadcast, carrito, traslados entre sedes, los 8 reportes y las
auditorías.

**Lo más importante, y es una ventana que se cierra**: la migración de datos sólo es
trivial **ahora**. Con una sola sede, todo el stock es de esa sede por definición.
Con dos sedes ya operando sobre un contador único, repartir el saldo pasa a ser una
decisión contable, no técnica — y deja de ser reconstruible. Lo que la hace viable
es que `inventory_movements.branch_id` es `NOT NULL` y sí registra la sede, así que
el **histórico** es recuperable por sede aunque el **saldo** no lo sea.

---

## 3. El canal de realtime es público — y ahora se sabe que cerrarlo es viable

El POS se suscribe a `stock-sync:{tenantId}` con la **anon key**, que va embebida en
el binario, y el canal es **público**. Consecuencia: cualquiera con esa clave puede
suscribirse al canal de cualquier tenant y **publicar** eventos falsos
`batch_stock_update` / `product_delete` / `product_upsert`, que el POS aplica a
memoria **y persiste en su SQLite** (`persist()` en `realtime-sync.ts`).

Activar RLS sobre `realtime.messages` a secas sería falsa seguridad: en canales
públicos Realtime no consulta esas policies. Cerrarlo exige **tres cambios
acoplados**, y dejar cualquiera a medias deja al POS sordo:

1. `config: { private: true }` en `client.channel(...)` de
   `kronos-fact/src/lib/realtime-sync.ts:41`.
2. `supabase.realtime.setAuth(accessToken)` en el POS — hoy sólo usa la anon key.
   **Dato nuevo del 2026-08-09 que desbloquea esto**: `/api/fact/auth:89-99` firma
   un JWT de Supabase **real** con `SUPABASE_JWT_SECRET`, `role: "authenticated"` y
   `sub` = id del usuario. Es decir, `setAuth` funciona tal cual, sin construir nada.
   Del lado del ERP, `stock-broadcast.ts` emite con el service role, que también
   necesitará `setAuth`.
3. Policies de SELECT/INSERT sobre `realtime.messages` filtrando por
   `realtime.topic()`. El JWT no lleva claim de tenant, así que la policy tiene que
   resolverlo con una subconsulta sobre `profiles` — envuelta en `(SELECT …)` para
   que el planificador la trate como InitPlan, que es la lección de la migración
   00031.

**Hacerlo con dos terminales delante.** La verificación no es opcional: el modo de
fallo es que el POS deje de recibir stock y nadie se entere hasta que una caja venda
contra un inventario viejo.

El razonamiento de por qué no se hizo antes está en `00040_device_identity.sql:119-136`.

---

## 4. Credenciales expuestas en un repositorio PÚBLICO — rotar

**`codeopenfounder/erp-peruonice` es público.** Verificado el 2026-08-09 contra la
API de GitHub (`isPrivate: false`). También lo son `lector-peruonice` y `codeopen`;
`poi-fact` es el único privado.

Hasta el 2026-08-09 el repositorio contenía **dos contraseñas en claro**, escritas a
mano en tres ficheros de `e2e/`:

| Credencial | Dónde estaba |
|---|---|
| Contraseña del **superusuario `postgres`** de `db.ctlvfkiwpmyljeofgitz` | `e2e/smoke-fixes.spec.ts`, `e2e/promotions.spec.ts` |
| Contraseña del **administrador del ERP en producción** (`administracion@peruonice.com`) | `e2e/smoke-fixes.spec.ts`, `e2e/auth.setup.ts` |

La de Postgres es la más grave: es acceso directo a la base, saltándose RLS y la
aplicación entera.

**Ya no están en el código** —salen de `.env.local`, que está en `.gitignore`— pero
**eso no las descompromete**: siguen en el historial público, que ha sido clonable e
indexable durante semanas.

### Runbook de rotación (pendiente, es acción humana)

1. **Contraseña de Postgres**: Supabase → Settings → Database → *Reset database
   password*. Actualizar `E2E_PG_PASSWORD` en `.env.local`. Comprobar que nada más
   la usa (los dos scripts que la llevaban se borraron el 2026-08-08).
2. **Contraseña del administrador**: cambiarla desde el ERP o desde Supabase Auth.
   Actualizar `E2E_TEST_PASSWORD` en `.env.local`.
3. **Decidir la visibilidad del repositorio.** Mientras siga público, cualquiera
   puede leer el historial: `gh repo edit codeopenfounder/erp-peruonice --visibility private`.
4. Sólo si se hace privado tiene sentido plantearse purgar el historial
   (`git filter-repo`); en un repo que ya fue público, la purga no recupera nada.
5. Revisar los logs de acceso de Supabase por si hubo uso ajeno.

## 5. El PAT de GitHub embebido en el remoto de `poi-erp`

`git -C poi-erp remote -v` devuelve la URL con un token `ghp_…` dentro. Está en
`.git/config` en claro y aparece en cualquier `git remote -v`, en cualquier captura
de pantalla y en cualquier log que ejecute ese comando.

**No es el arreglo barato que parecía. Es la única credencial que puede empujar
nada.** Comprobado el 2026-08-09 contra la API de GitHub:

| Credencial | `erp-peruonice` | `poi-fact` | `lector-peruonice` |
|---|---|---|---|
| Cuentas de `gh` (`jhenryorellana-eng`, `ing-mauricio-sb`) | lectura (`push: false`) | sin acceso (404) | lectura, push 403 |
| **PAT del remoto de `poi-erp`** | ✅ push | ✅ push | ✅ push |

Es decir: quitar el token de la URL sin más **deja los tres repositorios sin
forma de empujar**, y `gh auth login` no lo resuelve porque esas cuentas no son
colaboradoras con escritura de la organización `codeopenfounder`.

Trampa relacionada: el gestor de credenciales de Windows **gana** a un
`-c credential.helper=…` añadido en la línea de órdenes, y devuelve la credencial
de la cuenta equivocada. Con `poi-fact` eso produce un *"Repository not found"*
que parece que el repositorio no existe cuando lo que pasa es que la credencial no
tiene acceso. Para usar el PAT sin escribirlo en ningún sitio hay que **resetear la
lista** primero:

```bash
PAT=$(git -C poi-erp remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
HELPER="!f() { echo username=x-access-token; echo password=$PAT; }; f"
git -C <repo> -c credential.helper= -c credential.helper="$HELPER" push origin main
```

Runbook de verdad, en este orden:

1. **Crear un PAT nuevo** con `repo` sobre la organización `codeopenfounder`.
2. **Guardarlo en el gestor de credenciales de Windows**, no en la URL:
   `git credential approve` o `cmdkey`. Comprobar que `git push --dry-run`
   funciona en los tres repositorios.
3. Sólo entonces, quitar el token de la URL:
   `git -C poi-erp remote set-url origin https://github.com/codeopenfounder/erp-peruonice.git`
4. **Revocar el PAT viejo** en GitHub → Settings → Developer settings → Tokens.
   Hay que considerarlo comprometido: ha aparecido en cada `git remote -v`.

Alternativa más limpia si hay varias personas: dar acceso de escritura a las
cuentas ya autenticadas en `gh` y prescindir del PAT.

---

## 6. Autorización offline tras reiniciar el POS

Los cuatro diálogos ya autorizan sin conexión a quien tiene la sesión abierta
(hecho el 2026-08-09). Pero queda un matiz que conviene tener presente:

- El `auth-store` **no persiste** (`kronos-fact/src/stores/auth-store.ts`, sin
  `persist` de zustand).
- El login por PIN es **online** (`sync-engine.ts:600-666` → `/api/fact/auth`).
- `auth-guard.tsx` programa un `clearSession()` al llegar `expiresAt` (8 h).

Es decir: **un POS reiniciado sin red no tiene ni `cargo`**, así que no puede
autorizar nada — ni vender, porque no puede entrar. `isSelfAuthorized` resuelve el
caso "estoy dentro y se cayó la red", que es el habitual, pero no "arranco sin red".

Lo que haría falta para resolverlo de verdad, y por qué no es trivial:
`fact_user_assignments.pin_code` está **en claro** y son 4 dígitos, así que
cualquier copia local es fuerza-brutable en milisegundos si alguien tiene el
fichero. La protección tendría que venir del cifrado del almacén local, no de un
hash. Es diseño, no una tarde de código.

---

## 7. `types/database.ts` generado de verdad — ✅ RESUELTO (2026-08-09)

`src/types/supabase.ts` (3.945 líneas) generado con
`npm run db:types` → `supabase gen types typescript --project-id ctlvfkiwpmyljeofgitz`.
Va en una ruta distinta de `types/database.ts` a propósito: mezclarlos fue lo que
permitió que el escrito a mano se quedara 37 migraciones por detrás sin que nadie lo
notara. `types/database.ts` conserva sus tres tipos de identidad y ahora remite al
generado en su cabecera.

---

## 8. Verificación pendiente y restos menores

- **El primer ticket impreso tras cobrar no lleva hash.** El hash sólo existe
  después de que el proveedor firme, y el POS es offline-first. La reimpresión sí lo
  lleva. Aceptado por diseño.
- **`fn_next_correlative` se consume ANTES del INSERT**, así que un insert fallido
  deja un hueco en la serie. Documentado y aceptado: SUNAT valida unicidad, no
  continuidad, y reutilizar un número ya enviado sí produce rechazo (`0402`).
- **`action: "retry"` de `/api/fact/sunat` sigue con su propia reconstrucción del
  payload**, en paralelo a `lib/sunat/resubmit.ts`, porque arrastra fallbacks que
  sólo aplican a comprobantes anteriores a la denormalización del cliente (acepta
  los datos del cliente en el body y los rellena en la fila). Se puede replegar
  sobre `resubmit` cuando esos comprobantes dejen de existir.
- **`void-auth-dialog.tsx` sigue sin importadores**, a propósito y con el porqué
  escrito en el fichero: es el molde del patrón `isSelfAuthorized` y la anulación
  directa vuelve en cuanto exista el Resumen Diario con ítem en estado 3.
- **`supplies` no tiene precio de venta ni tipo de afectación.** Por eso un adicional
  sólo puede ser gratuito y su valor referencial es `cost_price`, que es una
  aproximación. Cobrar un adicional exige una columna nueva y decidir su afectación
  de IGV — decisión de negocio, no técnica.
- **El Resumen Diario (RC) no está construido, y con este proveedor no se puede.**
  No hace falta para emitir: Billme hace `sendBill` de las boletas y devuelve CDR
  individual, verificado contra la API real (ver `facturacion-billme.md`). Serviría
  para dar de baja una boleta con el ítem en estado 3 — pero **el contrato del RC de
  Billme no tiene campo de estado de ítem**: su objeto `boletas` lleva
  `codigoTipoDocumento`, `serieComprobante`, `moneda`, `montoTotal`, `montoPagar` e
  `impuestos`, y nada más (documentación oficial, leída el 2026-08-09). Así que la NC
  motivo 01 no es un atajo: es la única vía de anular una boleta aquí. Eso deja
  también la anulación directa desde el POS fuera de alcance mientras siga Billme.
- **El POS no se probó a mano.** `void_invoice_local`, los cuatro diálogos con
  autorización offline y la pestaña «Adicionales» están cubiertos por los 27 tests de
  `cargo test` y por el typecheck, pero **Playwright no conduce una app de escritorio
  Tauri**, así que el camino real nunca se ejecutó. Falta: cortar la red, entrar como
  gerente, dar una cortesía y una salida operativa, y anular un comprobante con un
  producto compuesto comprobando en la SQLite que volvieron los insumos de la receta y
  que hay un `cash_register_movements` tipo `refund` con `synced = 1`.
- **`kronos-fact`: `main` empujado.** ✅ el 2026-08-09, con la 1.0.4. Lo que lo tenía
  bloqueado no era olvido sino credenciales, y el diagnóstico estaba mal: `git push`
  respondía *"Repository not found"*, que parecía que el repositorio no existiera. Lo
  que pasaba es que el gestor de credenciales de Windows imponía la cuenta
  equivocada. Con la lista de helpers reseteada, el PAT del remoto de `poi-erp` sí
  alcanza los tres repositorios (ver punto 5).
- **`poi-lector`: el PWA no era instalable.** ✅ arreglado el 2026-08-09. El
  manifiesto declaraba `poi-logo.png` como 192×192, 512×512 y `maskable` a la vez, y
  ese fichero mide **72×60 px**. Chrome exige un icono de 192 px real para ofrecer la
  instalación, así que el prompt no aparecía. Se generan `icon-192.png`,
  `icon-512.png` y `icon-maskable-512.png` desde el logo, con fondo blanco sólido y
  el 20 % de margen del maskable. Queda blando al ampliar desde 72 px: **con un logo
  de origen a 512 px o en SVG saldría nítido**, y regenerarlos es un comando.
  `tsconfig.tsbuildinfo` sale del índice y entra en `.gitignore`.
- **`syncPendingEntries` / `syncPendingExits` de poi-lector rompen en el primer
  ítem fallido**, así que una entrada mala bloquea todo lo que va detrás hasta el
  ciclo siguiente (30 s). No se tocó en esta sesión.

---

## 9. Lista de verificación del día del desbloqueo

Cuando la Clave SOL esté corregida, esto es lo que hay que comprobar **en este
orden**. Los tres primeros pasos no emiten nada.

1. **Sonda de credenciales.** `ConsultarCdr` sobre un correlativo que no existe
   (p. ej. `F001-99999999`). Tiene que devolver **`0127`** («el ticket no existe» —
   habla del documento consultado, luego la autenticación pasó). Si devuelve
   cualquier código de `SUNAT_AUTH_FAULTS`, la clave sigue mal y no hay que seguir.
   En el ERP: botón «Verificar» de Configuración › POI Fact; el aviso rojo trae el
   remedio del código concreto.
2. **Comprobar que no hay nada caducado nuevo.** Consulta de los comprobantes en
   `issued`/`rejected` con su plazo. Los siete de la tabla de arriba deben seguir
   marcados «Fuera de plazo» y ninguno más.
3. **Confirmar que el auto-reenvío los va a recoger.** `B001-00000307` y
   `B002-00000001` tienen que salir como sistémicos, en plazo y fuera del
   enfriamiento de 30 minutos.
4. **Esperar un pull del POS** (cada 2 min) o forzar el reenvío. Las dos deberían
   pasar a `accepted` **solas**. Si hay que reintentarlas a mano, el auto-reenvío
   sistémico no está funcionando y eso es un fallo que investigar.
5. **Verificar el CDR**, no sólo el estado: descomprimir el `cdrBase64` y confirmar
   `ResponseCode 0`. Y que la fila tenga `hash_code`, `xml_url` y `cdr_url`
   apuntando al bucket `sunat-documents`.
6. **Una venta real desde el POS**, de punta a punta, comprobando que el ticket
   impreso lleva el QR con el hash. Ojo: **el primer ticket tras cobrar no lleva
   hash** y eso es correcto —el hash sólo existe después de que el proveedor firme, y
   el POS es offline-first—; la reimpresión sí lo lleva.
7. **Una NC motivo 01** sobre esa venta. Es la primera vez que se usaría la serie
   `BC01`, así que conviene hacerla con algo de S/ 1.00 y no con una venta real
   grande.

Sólo cuando 1–6 pasen puede decirse que el sistema de facturación está operativo.
Hasta entonces, «desplegado» y «emitiendo» son cosas distintas.
