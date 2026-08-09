# Pendiente

Investigado y verificado. Ordenado por gravedad. Actualizado el **2026-08-09** tras
cerrar el ciclo asíncrono de anulación (punto 2), la autorización offline del POS
(6.2), la línea de insumo del comprobante (6.1) y el punto 7 completo.

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

## 0. Lo único que bloquea de verdad, y no es código

**La empresa no está autorizada en producción del proveedor.** `fact_config` tiene
`provider = apisunat` e `is_production = true`, así que **hoy, si el POS emite, el
comprobante se rechaza**. Las últimas seis emisiones reales (4–6 de mayo de 2026)
están en `rejected` con el mismo mensaje: *"Esta empresa no tiene autorización para
emitir documentos en el entorno de producción"*. Todo lo aceptado hasta hoy salió
contra `sandbox.apisunat.pe`.

**`fact_config.detraction_account` está en NULL**: la primera factura con SPOT se
rechazaría.

Nada del resto de esta lista importa hasta resolver esas dos cosas. Ambas son
gestión, no desarrollo.

Estado fiscal de la base, sondeado el 2026-08-09:

- 0 comprobantes en `issued`, 0 en `sent_to_sunat`, 0 con `sunat_attempts >= 5`. El
  bucle de auto-retry no tiene nada pendiente y el dead-letter está vacío.
- 1 sede, 2 cajas activas.
- 278 comprobantes, de los que sólo 21 los emitió el POS; los otros 253 son
  registros históricos cargados a mano (todos con `created_at` en segundo `:00`, sin
  `xml_url`, sin `sunat_document_id`, sin `hash_code`).

---

## 1. Encender las líneas gratuitas — un paso, con sonda previa

**El código está completo y APAGADO**, tras el interruptor
`fact_config.emit_free_lines` (migración 00041, default `false`).

Qué hay implementado: `buildProductos` del adapter de Billme deja de descartar la
línea de importe cero cuando trae valor referencial, y la emite como operación
gratuita — `precioUnitario: 0`, el valor referencial en `precioLista` con
`codigoTipoPrecio: "02"` (catálogo 16), tributo 9996 (GRA) y código de gratuidad del
catálogo 07 según la afectación del bien (15 gravado / 21 exonerado / 37 inafecto).

**Por qué está apagado.** Hoy una boleta con cortesía se **acepta** precisamente
porque la línea desaparece del payload y los totales cuadran. Al declararla como
gratuita, SUNAT exige además el total de venta gratuita del comprobante, y la
documentación de Billme lista nueve campos en `totales` y **ninguno** de venta
gratuita. Encenderlo a ciegas podría convertir una boleta que hoy se acepta en un
rechazo completo. No es una cautela teórica: el modo de fallo es la vía de venta
principal.

**Sonda, con el token de DESARROLLO de Billme:**

1. Emitir en beta una boleta con una línea normal y una cortesía.
2. Volcar la respuesta cruda: `faultCode` vacío y `cdrBase64` presente.
3. Descomprimir el `cdrBase64` y comprobar `ResponseCode 0`.
4. Decodificar el `xmlDocument` y comprobar que la línea gratuita lleva
   `cac:AlternativeConditionPrice` con `cbc:PriceTypeCode` `02` y el tributo 9996.
5. Si SUNAT reclama el total de venta gratuita (código 2027 o similar), **no
   forzarlo**: documentar el hueco de contrato y preguntar al proveedor qué campo
   espera. La línea gratuita se queda fuera hasta tenerlo.

Sólo entonces:

```sql
UPDATE public.fact_config SET emit_free_lines = true WHERE tenant_id = '…';
```

Mientras esté apagado, el comportamiento es el histórico: la cortesía sale en el
ticket impreso y no en el comprobante electrónico. **Eso ya era así**, no es una
regresión de esta sesión — pero ahora está sabido y tiene arreglo listo.

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

Runbook:

```bash
# 1. Quitar el token de la URL
git -C poi-erp remote set-url origin https://github.com/codeopenfounder/erp-peruonice.git

# 2. Autenticar de forma persistente sin embeber nada
gh auth login          # o el credential helper de Windows

# 3. Rotar el PAT en GitHub → Settings → Developer settings → Tokens
#    (el que estaba en la URL hay que considerarlo comprometido)
```

No toca código. Es el hallazgo de seguridad más barato de arreglar de esta lista.

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

## 7. `types/database.ts` generado de verdad

Se podó el 2026-08-09 de 432 líneas y 36 tipos a los **tres** que el código importa
(`Cargo`, `Profile`, `Tenant`), con una cabecera que dice qué es y qué no. Eso quita
la trampa —declaraba `invoices.branch_id`, exactamente la columna del bug del
webhook de Culqi— pero no resuelve el fondo: **no hay tipos generados**.

Para tenerlos: `supabase gen types typescript --project-id ctlvfkiwpmyljeofgitz`,
con un script `db:types` en `package.json` y el fichero resultante en una ruta
distinta (`src/types/supabase.ts`) para no volver a confundir lo generado con lo
escrito a mano.

---

## 8. Restos menores, ya sin sangre

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
- **El Resumen Diario (RC) no está construido.** No hace falta para emitir: Billme
  hace `sendBill` de las boletas y devuelve CDR individual, verificado contra la API
  real (ver `facturacion-billme.md`). Haría falta sólo para **dar de baja una
  boleta** con el ítem en estado 3, y eso hoy se resuelve con una NC motivo 01, que
  es válida y síncrona. Es también lo único que falta para reactivar la anulación
  directa desde el POS.
- **`poi-lector` tiene dos ficheros modificados sin commitear**, uno de ellos
  `tsconfig.tsbuildinfo`, que es un artefacto de build y no debería estar
  versionado. Añadirlo a `.gitignore` y sacarlo del índice.
- **`syncPendingEntries` / `syncPendingExits` de poi-lector rompen en el primer
  ítem fallido**, así que una entrada mala bloquea todo lo que va detrás hasta el
  ciclo siguiente (30 s). No se tocó en esta sesión.
