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
- **Falta el polling.** Nadie llama a `ConsultarEstadoTicket`, así que
  `sunat_summaries.status` se queda en `pending`. Por eso el botón "Anular" del POS
  sigue deshabilitado y se anula con NC motivo 01, que es síncrona.

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
