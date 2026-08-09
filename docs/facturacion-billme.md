# Facturación electrónica con Billme

Estado a 2026-08-08. Sustituye a apisunat como proveedor SUNAT.

## Cómo funciona

`fact_config.provider` decide el adapter (`src/lib/sunat/factory.ts`). La emisión
ocurre dentro de `/api/fact/sync/push` cuando POI Fact empuja un comprobante;
`/api/fact/sunat` solo cubre `retry`, `void` y `status`.

**La persistencia vive fuera de los adaptadores**, en `src/lib/sunat/persist.ts`.
`submit()` es puro y devuelve un `SunatProviderResponse`; los tres sitios de
llamada invocan `persistSunatResult()`, que comprueba el error del `UPDATE`.
Antes cada adapter escribía él mismo en `invoices` y un drift de esquema se
tragaba en silencio el resultado de una emisión.

## Particularidades de la API de Billme

Todo verificado contra la API real, no solo contra la documentación (que no trae
ni un ejemplo de respuesta y en varias tablas se contradice con sus ejemplos).

| Aspecto | Realidad |
|---|---|
| Host | Uno solo: `https://www.api.billmeperu.com/api/v1` |
| Ambiente | **Lo decide el token**, no la URL. En el panel de Billme la empresa se registra como "Desarrollo" o "Producción" |
| Auth | Header plano `token`, no `Authorization: Bearer` |
| Respuesta | Envuelta: `{ statusCode, message, data: {...} }`. Los errores de validación llegan como ProblemDetails de ASP.NET (`{ title, status, errors }`), **sin `data`** |
| Éxito | HTTP 200 y `data.faultCode === ""`. En rechazo llega `"soap-env:Client.2800"` (passthrough del código SUNAT) |
| PDF / QR / hash | **No los devuelve.** El hash hay que extraerlo del `xmlDocument` firmado |
| Retención | Purga XML y CDR a los 40–90 días → se archivan en el bucket `sunat-documents` |
| Duplicados | **No los detecta**: reenviar el mismo comprobante responde "aceptada" otra vez |
| Correlativos | Los gestionamos nosotros; Billme respeta el que se le envía |
| `ConsultarCdr` | Solo en producción y solo para facturas, NC y ND |

### El hash no lleva prefijo de namespace

`DigestValue` aparece **sin** `ds:` en el XML. `extractDigestValue()` acepta
cualquier prefijo. Es lo que alimenta el hash impreso y el décimo campo del QR de
SUNAT, que antes iba vacío (y por tanto el QR no era verificable).

### Semántica de importes de línea

| Campo enviado | Sale en el XML como |
|---|---|
| `precioUnitario` | `cac:Price/cbc:PriceAmount` — **sin** IGV |
| `precioLista` | `AlternativeConditionPrice` — **con** IGV |
| `montoSinImpuesto` y `montoTotal` | `cbc:LineExtensionAmount` — valor de venta |

Los descuentos ya vienen aplicados dentro de `subtotal`/`total`, así que
`montoDescuento` va en 0: informarlos otra vez los descontaría dos veces.

## Verificación del token y del ambiente

`src/lib/sunat/verify.ts` usa `ConsultarCdr` como sonda (no emite nada):

- `404` → token inválido
- `401 "sólo está disponible para empresas de producción"` → token de **desarrollo**
- cualquier otra → token de **producción**

`saveFactConfig` **bloquea el guardado** si el ambiente del token no coincide con
`is_production`. Sin este control, pegar el token de desarrollo con Modo
Producción activo emitiría contra homologación con apariencia de éxito total:
boletas sin validez fiscal y nadie enterándose. El sistema ya sufrió el fallo
gemelo con apisunat (`is_production = true` apuntando a sandbox).

### El token válido no basta: las credenciales SOL del emisor

Un token perfectamente válido convive con la imposibilidad total de emitir. Son
dos cosas distintas y fallan por separado:

- el **token** identifica a la empresa ante Billme;
- el **Usuario SOL / Clave SOL** que la empresa tiene guardados en el panel de
  Billme son con los que Billme se autentica **ante SUNAT** en su nombre.

Si los segundos están mal, Billme construye el comprobante, lo firma con el
certificado correcto y SUNAT lo rechaza en la puerta. `ConsultarCdr` usa esas
mismas credenciales, así que la sonda las detecta **sin emitir nada** — se puede
repetir tantas veces como haga falta mientras se ajusta el panel.

Por eso `TokenVerification` tiene `solWarning`, y por eso la página de
comprobantes marca «Credenciales del emisor» cuando el código de rechazo está en
`SUNAT_AUTH_FAULTS` (`lib/sunat/policy.ts`). Antes de eso, el botón «Verificar»
decía *"Token válido, de una empresa de PRODUCCIÓN"* mientras SUNAT devolvía
`0103` y ninguna boleta podía emitirse.

**La cadena de autenticación de SUNAT se recorre por orden**, y cada código dice
exactamente qué falta. Recorrida entera en producción el 2026-08-09 mientras se
configuraba el emisor:

| Código | Qué significa | Qué había que tocar |
|---|---|---|
| `0103` | El usuario SOL no existe | El usuario secundario no estaba creado en SUNAT |
| `0110` | No se pudo obtener el tipo de usuario | Existe, pero sin perfil de facturación electrónica |
| `0111` | No tiene el perfil para enviar comprobantes | Falta la opción de envío del SEE |
| `0112` | El usuario debe ser secundario | Se puso el usuario principal |
| `0113` | El usuario no está afiliado a Facturación Electrónica | Falta afiliar el RUC al SEE – Del Contribuyente |
| `0140` | Existe un documento igual en proceso | **Ya no es autenticación**: SUNAT recibió el documento |

Un detalle de formato que costó un fallo: **Billme no usa un separador único**.
`EnviarBoletaFactura` devuelve `a:Client.0103` y `ConsultarCdr` devuelve
`ns0:0103`. Partir por el punto reconocía el primero y no el segundo, así que la
sonda daba verde justo en el caso que venía a detectar. `extractSunatCode()`
busca el número final, que es lo único estable.

**En el campo "Usuario SOL" del panel de Billme va el usuario secundario A SECAS:
Billme le antepone el RUC por su cuenta.** SUNAT autentica con `RUC + usuario`
(por eso la credencial canónica de la beta es `20000000001MODDATOS`), pero eso lo
compone el proveedor. Su documentación no lo dice; se dedujo de tres intentos:

| Valor en el panel | Lo que recibe SUNAT | Resultado |
|---|---|---|
| `SECUSTAN` | `20613509446SECUSTAN` | `0103` — ese usuario no existía |
| `20613509446SECUSTAN` | `2061350944620613509446SECUSTAN` | `0103` — RUC duplicado |
| `ASTOWNSP` | `20613509446ASTOWNSP` | autentica |

Escribir el RUC delante es un error silencioso: da el mismo `0103` que un usuario
inexistente, así que parece un problema de SUNAT cuando es de formato.

### Autenticar no es poder emitir

`ASTOWNSP` autenticaba y aun así los envíos seguían fallando con `0110`. La
diferencia se ve comparando los dos endpoints, y es el diagnóstico más útil de
toda esta sección:

| Operación | Respuesta | Lectura |
|---|---|---|
| `ConsultarCdr` | `0127` "el ticket no existe" | habla del documento consultado → **la autenticación pasó** |
| `EnviarBoletaFactura` | `0110` "no se pudo obtener el tipo de usuario" | el usuario existe pero **no tiene permiso de envío** |

Lo que faltaba estaba en SUNAT, en la pantalla **«Asignación de Perfiles»** del
usuario secundario (Clave SOL del usuario principal → nombre de la empresa →
Administración de Usuarios Secundarios → Asignar perfiles):

```
TRIBUTARIOS
  └─ Comprobantes de pago
      └─ SEE - Del Contribuyente y Envío de Documentos
          ├─ Servicio de Envío de Documentos Electrónicos   ← el permiso que faltaba
          ├─ Certificado Digital
          └─ Consultar Envíos de CPE
```

Cuidado con el `0140` ("Existe un Documento igual en Proceso, vuelva a intentarlo
en 15 minutos") mientras se depura esto: es un bloqueo **por documento** que SUNAT
aplica ANTES de comprobar el permiso de envío, así que un comprobante reintentado
lo devuelve en bucle y parece que la autenticación ya funciona. Para saber si el
envío funciona de verdad hay que mandar un **correlativo nuevo**, que no arrastra
ese bloqueo.

## Series

Cada tipo de documento tiene serie propia, y por tanto **contador propio**:

| Tipo | Serie | `document_type` | Caja |
|---|---|---|---|
| Factura | F001, F002… | `factura` | una por caja |
| Boleta | B001, B002… | `boleta` | una por caja |
| NC de factura | FC01 | `nota_credito_factura` | compartida |
| NC de boleta | BC01 | `nota_credito_boleta` | compartida |
| ND de factura | FD01 | `nota_debito_factura` | compartida |
| ND de boleta | BD01 | `nota_debito_boleta` | compartida |

**Boleta y factura llevan una serie por caja** (migración `00038`; el sufijo sale
del código de la caja: `CAJA-02` → `B002`/`F002`). No lo exige SUNAT, lo exige la
arquitectura: el POS calcula en local el número que imprime en el ticket, y dos
terminales sobre la misma serie comparten contador. `createCashRegister` crea las
series de toda caja nueva, y la pestaña Series avisa si alguna activa se queda sin
ellas.

**Las notas siguen compartiendo serie entre cajas a propósito**: su correlativo lo
asigna siempre el servidor durante el push, nunca se imprime un número calculado
en local antes de sincronizar, así que no pueden divergir.

Los efectos de cada motivo en stock y caja están en
`notas-de-credito-y-debito.md`; la fuente única es `src/lib/sunat/note-effects.ts`.

SUNAT **no** obliga a que la nota tenga serie distinta de la del comprobante que
modifica: la Guía XML de Nota de Crédito UBL 2.1 dice que la serie *"salvo el
primer carácter, no necesariamente debe coincidir"*, y el Manual del Programador
ejemplifica `-01-F001-1`, `-07-F001-1` y `-08-F001-1`. Lo obligatorio es:

- **primer carácter** `F` si modifica factura, `B` si modifica boleta (Anexo N.° 3
  de la RS 097-2012, sust. por RS 114-2019); incumplirlo produce el rechazo 2345;
- **correlativo independiente** por (tipo de documento + serie).

Como `fn_next_correlative()` opera por fila de serie, compartir serie significaba
compartir contador: cada nota consumía un número de la boleta y abría huecos.
**Ese era el bug real.** Los huecos históricos de `B001` se dejan como están:
SUNAT valida unicidad, no continuidad, y reutilizar un número ya enviado sí
produce rechazo (`0402`).

## Anulación: el Resumen de Bajas (RA)

Billme no tiene endpoint de anulación. Se envía un **resumen** con
`POST /Emission/EnviarResumen` (`tipoComprobante: "RA"`) y devuelve un **ticket**:
la respuesta inmediata sólo confirma que SUNAT recibió el resumen, no que lo haya
aceptado.

- **El correlativo del resumen lo numera el emisor.** SUNAT lo identifica por
  `RA-AAAAMMDD-N`, con N propio y creciente dentro de la fecha. Billme se limita a
  respetar el que se le manda; iba fijo a `"1"`, así que la segunda baja del mismo
  día reutilizaba el identificador de la primera. Ahora sale de
  `fn_next_summary_correlative()` (migración `00039`) y el envío queda registrado
  en `sunat_summaries` con su ticket.
- **Una boleta no se anula por RA.** El RA (`VoidedDocuments`) cubre facturas y las
  notas vinculadas a factura; la baja de una boleta va dentro de un Resumen Diario
  con el ítem en estado 3. El adapter lo rechaza con un mensaje que remite a la NC
  motivo 01.
- ~~**Falta el polling.**~~ — **hecho el 2026-08-09.** Ver la sección siguiente.

## Consulta del ticket: `ConsultarEstadoTicket`

Es lo que cierra el ciclo. Contrato confirmado contra la documentación de Billme:

```
POST https://www.api.billmeperu.com/api/v1/Emission/ConsultarEstadoTicket
{ numDocEmisor, numTicket, tipoComprobante: "RC"|"RA", serie, correlativo }
```

`serie` es el **`AAAAMMDD`** del identificador del resumen y `correlativo` el N
dentro de esa fecha — o sea, exactamente las dos columnas que ya guarda
`sunat_summaries` (`reference_date` y `correlative`). Mismo criterio de nombres que
`EnviarResumen`.

**Billme no documenta la respuesta de este endpoint.** Su tabla de
`respuesta-de-consultas` mete `cdrBase64`, `xmlBase64` y `ticketNumber` en una sola
tabla sin decir qué endpoint devuelve cuál. La referencia de SUNAT para `getStatus`
es: `0` procesado (el contenido trae el CDR), `98` en proceso, `99` procesado con
errores.

Por eso el mapeo de `bilme-adapter.checkTicket()` se apoya **sólo en lo que el sobre
garantiza** y NO desempaqueta el ZIP del CDR para leer el `ResponseCode`: hacerlo
exigiría un descompresor y, sobre todo, fiarse de una forma de respuesta no
documentada. En orden de precedencia:

| Se observa | Veredicto |
|---|---|
| `faultCode` no vacío | `rejected` (passthrough del fault de SUNAT) |
| descripción con "en proceso" / "98" | `pending` |
| `cdrBase64` presente | `accepted` |
| nada de lo anterior | `pending` |

La heurística de "en proceso" va **antes** de comprobar el CDR a propósito: si algún
día Billme devolviera el CDR del envío junto con un "en proceso", tratarlo como
aceptado marcaría como anulado un comprobante que SUNAT aún no ha dado de baja. Ante
la duda, `pending` sólo cuesta otra consulta en dos minutos; un `accepted` de más es
un comprobante mal declarado. **Cuando se confirme el formato real contra la API,
sustituir la heurística por la comprobación exacta.**

Un timeout o un fallo de red devuelven `pending`, nunca `rejected`: un fallo de
transporte no dice nada sobre lo que SUNAT decidió.

### El reloj y el tope

No hay cron en Vercel (`vercel.json` sólo fija región), así que
`pollPendingSummaries()` se dispara desde el pull del POS —cada 2 minutos— y desde
un botón en la página de comprobantes del ERP. Con el POS apagado no se consulta
nada, y es aceptable: la baja ya está enviada y el plazo de SUNAT es de días.

`sunat_summaries.poll_attempts` corta a las 20 consultas (~40 minutos). Sin tope, un
ticket que nunca resuelve se consultaría ~720 veces al día para siempre.

### La asimetría del stock

La devolución de stock y el movimiento de caja se hacen **cuando se envía el RA**, no
cuando el ticket vuelve aceptado: la mercadería volvió físicamente y el dinero salió
del cajón en ese momento. Si SUNAT rechaza el resumen, deshacer la devolución
falsearía el inventario real, así que se notifica al módulo de comprobantes y el
comprobante vuelve a `accepted` para poder reintentar la baja.

## Operaciones gratuitas (cortesías y adicionales)

**Estado: implementado y APAGADO** tras `fact_config.emit_free_lines` (migración
`00041`, default `false`).

El defecto que corrige: `buildProductos` descartaba toda línea con
`total === 0 && subtotal === 0`, y `applyCortesia` del POS pone `unit_price: 0`. Es
decir, **cada cortesía se imprimía en el ticket y no existía en el comprobante
electrónico**. Y `reference_value` se calculaba en tres sitios del servidor sin que
ningún consumidor lo leyera.

Lo que exige SUNAT para una entrega sin contraprestación:

| Concepto SUNAT | Campo de Billme | Valor |
|---|---|---|
| `cac:Price/cbc:PriceAmount` | `precioUnitario` | **0** — no se cobró nada |
| `AlternativeConditionPrice` + `PriceTypeCode` | `precioLista` + `codigoTipoPrecio` | valor referencial **con** IGV + **`02`** |
| `cbc:LineExtensionAmount` | `montoSinImpuesto` / `montoTotal` | valor referencial **sin** IGV × cantidad |
| `TaxTotal` | `impuestos[0]` | tributo **9996** (GRA / FRE), IGV sobre esa base |
| Catálogo 07 | `codigoAfectacionIgv` | código de **gratuidad**, no el oneroso |

Catálogo 16, tipo de precio: `01` = precio unitario (incluye IGV), **`02` = valor
referencial unitario en operaciones no onerosas**.

Catálogo 07, códigos de gratuidad según la afectación del bien:

| Bien | Código | Descripción |
|---|---|---|
| gravado | **15** | Gravado – Bonificaciones |
| exonerado | 21 | Exonerado – Transferencia gratuita |
| inafecto | 37 | Inafecto – Transferencia gratuita |

`15` y no `11` (retiro por premio) ni `13` (retiro genérico): lo que hace el negocio
es entregar algo gratis **acompañando a una venta**, que es literalmente una
bonificación, y es coherente con la NC motivo 08 del catálogo 09 que
`note-effects.ts` ya modela como el único motivo que saca stock.

El POS mandaba `tax_type: "inafecto"`, que es el código **30** — *inafecto operación
onerosa*, que es otra cosa.

**El valor referencial** sale de `lib/sunat/reference-values.ts`:
`supplies.cost_price` para un adicional (es lo único que hay: `supplies` no tiene
precio de venta) e `invoice_items.original_unit_price` para una cortesía — que es el
caso mejor, porque el precio que se regaló ES el valor de la operación. Mínimo 0.01:
un valor referencial en 0 deja la línea sin base imponible y SUNAT la rechaza.

### Por qué está apagado, y cómo encenderlo

Hoy la boleta con cortesía se **acepta** precisamente porque la línea desaparece y
los totales cuadran. Al declararla como gratuita, SUNAT exige además el **total de
venta gratuita** del comprobante — y la documentación de Billme lista nueve campos
en `totales` y **ninguno** de venta gratuita. Encenderlo sin comprobarlo podría
convertir una boleta que hoy se acepta en un rechazo completo, en la vía de venta
principal.

Sonda, con el token de **desarrollo**:

1. Emitir en beta una boleta con una línea normal y una cortesía.
2. Comprobar `faultCode` vacío y `cdrBase64` presente.
3. Descomprimir el `cdrBase64` → `ResponseCode 0`.
4. Decodificar el `xmlDocument` → la línea gratuita lleva
   `AlternativeConditionPrice` con `PriceTypeCode 02` y tributo 9996.
5. Si SUNAT reclama el total de venta gratuita, **no forzarlo**: documentar el hueco
   de contrato y preguntar al proveedor qué campo espera.

Sólo entonces: `UPDATE public.fact_config SET emit_free_lines = true WHERE tenant_id = '…';`

## Validación del RUC del emisor

**Billme no valida el RUC del emisor contra el token.** Verificado: en desarrollo
aceptó una boleta con un RUC ajeno. Así que un RUC mal formado pasa silenciosamente
en homologación y aparece como rechazo en producción, con el correlativo ya
consumido y un hueco en la serie.

Desde el 2026-08-09 el ERP lo valida con el checksum módulo 11 de SUNAT
(`lib/sunat/ruc.ts`) en tres puntos: el validador Zod de `saveFactConfig` —único
punto de escritura— y los dos caminos de emisión, para los RUC que ya estaban
guardados con el regex antiguo de "11 dígitos y nada más".

## Reintentos

`autoRetrySunat()` en `/api/fact/sync/pull` reenvía comprobantes en estado
`issued` en cada pull (cada 2 minutos). Ahora se acota con
`invoices.sunat_attempts` y `MAX_SUNAT_ATTEMPTS`; sin el tope, un comprobante que
SUNAT rechace de forma permanente se reenviaría ~720 veces al día.

## Corte a producción

### Paso 0 — RESUELTO: Billme envía la boleta individualmente, no hace falta RC

**Verificado contra la API real el 2026-08-08 con el token de desarrollo.** Se emitió
una boleta de prueba (`B900-700001`, S/ 11.80) contra `EnviarBoletaFactura` con
`codigoTipoDocumento: "03"`:

```
description : La Boleta numero B900-700001, ha sido aceptada
faultCode   : ""
cdrBase64   : 1776 chars
```

Al descomprimir ese `cdrBase64` aparece un CDR real de SUNAT:

```
archivo      : R-20613509446-03-B900-700001.xml
raíz         : <ar:ApplicationResponse ...>
ResponseCode : 0        (aceptada)
Description  : La Boleta numero B900-700001, ha sido aceptada
DocumentRef  : B900-700001
```

Lo mismo con una factura (`F900-700001` → `R-20613509446-01-F900-700001.xml`,
`ResponseCode 0`).

**Conclusión: Billme hace `sendBill` de las boletas y devuelve el CDR individual.
El Resumen Diario NO es necesario para emitir.** El corte queda desbloqueado por
este lado, con el plazo de la vía individual: 5 días calendario desde la emisión.

El RC sigue haciendo falta para **anular una boleta** (ítem en estado 3), pero eso
hoy se resuelve con una NC motivo 01, que es válida y síncrona.

Se deja escrito el razonamiento que llevó a declararlo bloqueante, para que no
vuelva:

> "`ConsultarCdr` no está disponible para boletas — precisamente porque la boleta
> no tiene CDR individual."

`ConsultarCdr` de Billme es un passthrough del servicio `getStatusCdr` de SUNAT, y
**SUNAT sólo habilita ese servicio para los tipos 01, 07 y 08**. La boleta queda
fuera siempre, se haya enviado como se haya enviado. La restricción es de SUNAT y
no dice nada sobre Billme. Además, desde la **RS 114-2019/SUNAT** el emisor elige
entre envío individual (`sendBill`, 5 días, CDR) y Resumen Diario (`sendSummary`,
7 días, ticket): el RC nunca fue obligatorio, es una de las dos vías.

Y conviene saberlo para futuras dudas: **la documentación de Billme no resuelve
nada de esto**. Su página de `EnviarBoletaFactura` no documenta respuesta alguna, y
`respuesta-de-consultas` mete `cdrBase64`, `xmlBase64` y `ticketNumber` en una única
tabla sin decir qué endpoint devuelve cuál. Contra esa API, la fuente de verdad es
la API.

### Resto del corte

0. **Antes que nada: la empresa no está autorizada en producción.** Las últimas
   seis emisiones reales (4–6 de mayo de 2026) están en `rejected` con el mensaje
   *"Esta empresa no tiene autorización para emitir documentos en el entorno de
   producción"*, y `fact_config.is_production` está en `true`. Todo lo aceptado
   hasta hoy salió contra `sandbox.apisunat.pe`. Sin resolver el alta en
   producción del proveedor, ningún corte tiene sentido.
1. Resolver con la empresa los comprobantes `rejected` de la era apisunat.
2. Congelar emisiones y comprobar que no queda nada en `issued` ni `sent_to_sunat`.
3. Pegar el token de **producción** y verificarlo: debe reportar *producción*.
4. Cambiar `fact_config.provider` a `bilme`.
5. Emitir una boleta real de monto mínimo y comprobar el CDR — es la primera vez
   que `ConsultarCdr` es utilizable y la única prueba legal de aceptación.
6. Verificar XML y CDR en el bucket `sunat-documents`.
7. Vigilar 30 minutos el bucle de reintentos.

`fact_config.detraction_account` debe tener la cuenta real del Banco de la Nación
antes de emitir facturas con SPOT, o serán rechazadas.

**El rollback es asimétrico**: volver a `apisunat` protege solo emisiones nuevas.
Los comprobantes ya emitidos por Billme no podrán consultarse ni anularse desde
apisunat.
