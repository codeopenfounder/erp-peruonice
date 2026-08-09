# Corte a Billme producción: la cadena de autenticación de SUNAT, entera

**Fecha**: 2026-08-09 (segunda tanda del día)
**Alcance**: `poi-erp`, `kronos-fact` (1.0.4), `poi-lector`

## Qué se buscaba

Que la empresa pudiera emitir de verdad. Hasta hoy **nada se había emitido nunca a
la SUNAT real**: los 279 comprobantes de la base eran cargas históricas a mano o
emisiones contra el sandbox de apisunat, y las siete emisiones reales estaban en
`rejected` con *"Esta empresa no tiene autorización para emitir documentos en el
entorno de producción"*.

## El hallazgo que reordenó el trabajo

**El proveedor activo era `apisunat`, no Billme.** Todo el trabajo de líneas
gratuitas de la tanda anterior vivía en el adapter de Billme; el de apisunat
descarta las líneas de importe cero sin excepción (`apisunat-adapter.ts:52`) y no
tiene camino gratuito alguno. Encender `emit_free_lines` no habría cambiado
absolutamente nada en producción, y el pendiente lo describía como si importara.

Se cambió el proveedor a Billme con el token de producción, previa verificación de
que el ambiente del token concuerda con `is_production`.

## La cadena de SUNAT, escalón a escalón

Cada código dice exactamente qué falta, y se recorrieron todos:

| Código | Significado | Qué había que tocar |
|---|---|---|
| `0103` | El usuario SOL no existe | El usuario secundario no estaba creado en SUNAT |
| `0110` | No se pudo obtener el tipo de usuario | Existía, pero sin perfil de facturación electrónica |
| `0104` | La clave ingresada es incorrecta | ← donde quedó |

Lo que **sí** estaba bien desde el principio, y se comprobó en vez de suponerse:

- **El certificado digital.** Extraído del XML firmado que devuelve Billme:
  `PERU ON ICE S.A.C.`, `organizationIdentifier=NTRPE-20613509446`, emitido por
  RENIEC (`ECEP-RENIEC CA Class 1 II`), vigente 2026-08-07 → 2029-08-06. Real, de
  la empresa y recién emitido.
- **El payload.** Se leyó entera la documentación oficial del proveedor y se
  comparó campo a campo: boleta, factura, NC, ND y RA coinciden. De paso resolvió
  una duda que estaba anotada para sondear —si `buildTotalesNota` necesitaba
  `totalConImpuestos`— y la respuesta es que no: las notas llevan exactamente cinco
  campos de totales.
- **La firma.** Billme devuelve el UBL firmado con `DigestValue` válido incluso
  cuando SUNAT rechaza.

## Lo que se aprendió y no estaba escrito en ningún sitio

**Billme antepone el RUC al Usuario SOL.** Su documentación no lo dice y despista:
para el ambiente de desarrollo recomienda `MODDATOS` a secas, cuando la credencial
canónica de la beta de SUNAT es `20000000001MODDATOS`. Se dedujo de tres intentos,
y escribir el RUC delante es un error silencioso porque da el mismo `0103` que un
usuario inexistente.

**Autenticar no es poder emitir.** `ConsultarCdr` respondía `0127` ("el ticket no
existe" — habla del documento consultado, luego la autenticación pasó) mientras
`EnviarBoletaFactura` devolvía `0110`. Esa asimetría entre los dos endpoints es el
diagnóstico más útil de todo el episodio, y es la que señaló que faltaba el permiso
de envío y no la credencial.

**El `0140` despista.** *"Existe un documento igual en proceso, vuelva a intentarlo
en 15 minutos"* es un bloqueo **por documento** que SUNAT aplica ANTES de comprobar
el permiso de envío. Reintentar el mismo comprobante lo devolvía en bucle y parecía
que la autenticación ya funcionaba. Hizo falta emitir un correlativo virgen
(`B002-00000001`) para desenmascararlo.

## Cambios de código

### `poi-erp`

**`src/lib/sunat/policy.ts` (nuevo).** Módulo puro, sin dependencias, para que lo
puedan importar tanto el servidor como los componentes cliente. Reúne:

- El **plazo legal de envío**: 3 días calendario para lo que empieza por serie `F`
  y 7 para lo que empieza por `B`, contados desde el día siguiente a la emisión
  (RS 000193-2020 con la modificación de la RS 000003-2023; RS 097-2012 art. 12).
  Se decide por el primer carácter de la serie y no por `document_type`, porque el
  Anexo N.º 3 obliga a que la serie de una nota comparta inicial con el documento
  que modifica: así una `FC01` hereda los 3 días de la factura y una `BC01` los 7 de
  la boleta. La tabla que había en la UI se equivocaba en tres casos.
- **`MAX_SUNAT_ATTEMPTS`**, que estaba duplicado a mano en `invoice-columns.tsx`
  porque `persist.ts` arrastra el cliente admin de Supabase y un componente cliente
  no puede importarlo. Ahora `persist.ts` lo re-exporta.
- **`SUNAT_AUTH_FAULTS`** y **`SUNAT_AUTH_FAULT_REMEDY`**: qué significa cada código
  de credenciales y qué hay que tocar para arreglarlo, incluido el árbol de permisos
  de SUNAT.
- **`SUNAT_SYSTEMIC_FAULTS`**: los que no son culpa del comprobante.

**Auto-reemisión de los fallos sistémicos.** `autoRetrySunat` sólo miraba
`status = issued`, así que una tarde con el emisor mal configurado dejaba toda la
facturación del día en `rejected`, fuera del bucle, para rescatarla a mano una por
una. Ahora recoge también los `rejected` por causa sistémica, sin mirar el contador
de intentos —ese contador mide fallos del documento y esto no lo es— con un
enfriamiento de 30 minutos por `updated_at` para no martillear al proveedor.
**El primer pull del POS tras arreglar la clave emite todo lo pendiente solo.**

**Guardarraíl de plazo** en los tres caminos de reenvío (auto-retry, botón del ERP,
ruta que usa el POS) y badge «Fuera de plazo» distinto de «Atascado»: un atascado se
recupera reintentando, un caducado ya no.

**El botón «Verificar» decía verde mientras SUNAT rechazaba al emisor.** Sólo miraba
el código HTTP, y `ConsultarCdr` responde 400 tanto cuando el comprobante consultado
no existe —lo esperado— como cuando SUNAT no reconoce al usuario. Ahora mira el
`faultCode` y devuelve `solWarning`.

**Un bug dentro del propio arreglo**: la extracción del código partía por el punto,
y Billme usa dos separadores — `a:Client.0103` al emitir y `ns0:0103` al consultar.
La sonda daba verde justo en el caso que venía a detectar. `extractSunatCode()` es
ahora la única implementación y `normalizeFaultCode` delega en ella.

**Banner** en la página de comprobantes cuando hay fallos de credenciales, con el
remedio concreto y la aclaración de que no hace falta reintentar a mano.

**Interruptor `emit_free_lines` en la UI** — antes sólo se encendía por SQL.

**Eliminado el fallback `correlative: 1`** del Resumen de Bajas, en las dos capas:
si la RPC del correlativo falla, no se manda nada. Con el fallback, la segunda baja
del día publicaba el identificador de la primera.

### `kronos-fact` 1.0.4

**El POS estaba ciego ante un rechazo.** El motivo de SUNAT viajaba del ERP, se
escribía en la SQLite local… y nunca se volvía a leer: el `SELECT` de
`get_invoices_by_date` no incluía `sunat_response_desc`. El cajero veía la etiqueta
roja y ninguna explicación. Y el botón de envío masivo —el camino natural cuando hay
varios pendientes— hacía `catch { failed++ }`, así que tiraba todos los motivos justo
cuando más falta hacen.

Cuatro cambios: la columna en el `SELECT` y en `InvoiceRow`, el campo en
`InvoiceRecord`, el motivo visible y copiable en la bandeja, y los motivos agrupados
en el toast del envío masivo.

No se copió `policy.ts` al POS a propósito: sería una tercera copia manual de reglas
y este repo ya sabe lo que cuesta eso. El servidor corta y devuelve el motivo; con
el arreglo del masivo, ese motivo llega al cajero.

### `poi-lector`

**El PWA no era instalable.** El manifiesto declaraba `poi-logo.png` como 192×192,
512×512 y `maskable` a la vez, y ese fichero mide **72×60 px**; Chrome exige 192 px
reales para ofrecer la instalación. Se generan los tres iconos con las dimensiones
que declaran, el maskable con su 20 % de zona de seguridad.

## Verificación

- `cargo test`: 27/27. Typecheck limpio en los tres proyectos.
- La clasificación por plazo del módulo TypeScript se contrastó contra los ocho
  comprobantes reales y coincide con la consulta SQL en los ocho, más los cuatro
  casos de series de nota.
- Consulta sobre producción de qué recogería el nuevo auto-retry: entran los dos
  recuperables y ninguno de los siete caducados — por partida doble, ni son
  sistémicos ni están en plazo.
- Instalador 1.0.4 compilado, copiado a `public/downloads/` con SHA-256 verificado
  contra el original, y el enlace de `config/poi-fact` actualizado.

## Lo que queda

- **La Clave SOL** en el panel de Billme (`0104`). Es lo único que separa al sistema
  de emitir.
- **`detraction_account`** sigue en NULL: la primera factura con SPOT se rechazaría.
- **Un token de desarrollo de Billme** para sondear las cortesías sin emitir
  documentos reales. La batería de 13 casos está escrita.
- **Siete comprobantes fuera de plazo** por S/ 9 766 — decisión contable, con la
  tabla y los importes en el pendiente.
