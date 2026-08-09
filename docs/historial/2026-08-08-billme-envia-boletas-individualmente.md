# Billme envía las boletas individualmente: el Resumen Diario no era bloqueante

Fecha: 2026-08-08. Cierra el punto 0 de `pendiente-notas-y-multipos.md`.

## El razonamiento que estaba mal

Dos sesiones anteriores dieron por bloqueante el corte a Billme con esta cadena:

> "Billme es un integrador SEE-Del Contribuyente. Bajo SEE-DC una boleta no puede
> enviarse individualmente: solo llega a SUNAT dentro del Resumen Diario (RC).
> Encaja con lo verificado empíricamente: `ConsultarCdr` no está disponible para
> boletas — precisamente porque la boleta no tiene CDR individual."

Los dos eslabones fallan:

1. **`ConsultarCdr` no es evidencia.** Es un passthrough del servicio `getStatusCdr`
   de SUNAT, que **sólo admite los tipos 01, 07 y 08**. La boleta queda fuera
   siempre, con independencia de cómo se haya enviado. Que Billme no deje consultar
   el CDR de una boleta no dice nada sobre si la boleta llegó a SUNAT.
2. **La premisa normativa estaba desactualizada.** Desde la **RS 114-2019/SUNAT**
   conviven dos vías legales:

   | Vía | Plazo | Mecanismo | Devuelve |
   |---|---|---|---|
   | Individual | emisión + **5 días** | `sendBill` | CDR individual |
   | Resumen Diario | emisión + **7 días** | `sendSummary` | ticket, se consulta aparte |

   El RC nunca fue obligatorio: es una de las dos.

## La comprobación

Token de Billme verificado primero como **de desarrollo** —`ConsultarCdr` responde
401 *"La consulta de CDR sólo está disponible para empresas de producción"*, que es
exactamente el criterio de `src/lib/sunat/verify.ts`— para no emitir un documento
fiscal real por accidente.

Luego, boleta de prueba de S/ 11.80 en serie `B900` (fuera del rango productivo):

```
POST /Emission/EnviarBoletaFactura   codigoTipoDocumento: "03"
HTTP 200
  description : La Boleta numero B900-700001, ha sido aceptada
  faultCode   : ""
  xmlDocument : 16224 chars
  cdrBase64   : 1776 chars
```

Descomprimiendo el `cdrBase64`:

```
archivo      : R-20613509446-03-B900-700001.xml
raíz         : <ar:ApplicationResponse ...>
ResponseCode : 0
Description  : La Boleta numero B900-700001, ha sido aceptada
DocumentRef  : B900-700001
```

Es un CDR de SUNAT, con el nombre canónico `R-<ruc>-<tipo>-<serie>-<correlativo>.xml`.
Se repitió con factura (`F900-700001` → `R-20613509446-01-F900-700001.xml`,
`ResponseCode 0`).

## Conclusión

**Billme hace `sendBill` de las boletas y devuelve el CDR individual.** El Resumen
Diario no hace falta para emitir y el corte no está bloqueado por esto.

El RC seguiría haciendo falta para **anular** una boleta (ítem en estado 3), pero eso
se resuelve con una NC motivo 01: válida, síncrona y sin depender de consultar un
ticket. Por eso el botón "Anular" del POS sigue deshabilitado a propósito.

La infraestructura de resúmenes de la migración `00039` no se desperdicia: la usa el
RA (comunicación de baja de facturas), que sí es el único camino de anulación de
factura en Billme.

## Lo que sí bloquea el corte

La empresa **no está autorizada en producción** en el proveedor. Las seis últimas
emisiones reales (4–6 de mayo de 2026) están en `rejected` con *"Esta empresa no
tiene autorización para emitir documentos en el entorno de producción"*, y
`fact_config.is_production` está en `true`. Todo lo aceptado históricamente salió
contra `sandbox.apisunat.pe`.
