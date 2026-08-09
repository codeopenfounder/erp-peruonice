# Series por caja, correlativo impreso y el resumen de bajas

Fecha: 2026-08-08. Cierra los puntos 1 y 5 de `pendiente-notas-y-multipos.md`,
parte del 2 y del 3, y corrige el razonamiento del punto 0.

## Lo que estaba roto

**CAJA 2 era una bomba con la espoleta puesta.** `createCashRegister` creaba la
caja y ninguna serie. El POS resuelve la serie con
`find(tipo && caja) || find(tipo)`, así que una caja sin serie propia no falla:
emite en silencio sobre la serie de otra. CAJA 2 llevaba meses activa, con un
usuario asignado y cero comprobantes — el día que vendiera, dos terminales
habrían compartido el contador de `B001`.

Encadenado con eso, otros dos defectos convertían "compartir contador" en
"entregar al cliente un ticket con un número que no es el del comprobante":

1. `get_next_local_correlative` hacía `SELECT current_correlative` y devolvía
   `current + 1` **sin escribir**. Dos ventas seguidas sin un pull intermedio —lo
   normal, el pull va cada 2 minutos— imprimían el mismo número.
2. El servidor devuelve el correlativo real en la respuesta del push, y
   `sync-engine.ts` lo tiraba: `mark_invoice_synced` sólo guardaba `server_id`.

## Lo que se hizo

**Migración `00038_series_por_caja.sql`**
- Serie de boleta y factura para cada caja activa cuyo código encaje con
  `CAJA-NN` (`CAJA-02` → `B002`/`F002`).
- Índice único parcial `(tenant_id, document_type, cash_register_id)` sobre las
  series con caja: hasta ahora nada impedía dos series de boleta activas para la
  misma caja, y el `find()` del POS habría elegido según el orden físico de la
  tabla SQLite.
- Backfill de `invoice_series.branch_id` desde la caja.

**Migración `00039_sunat_summaries.sql`** — `sunat_summaries`,
`sunat_summary_counters` y `fn_next_summary_correlative()`. El correlativo del
resumen no podía colgar de `invoice_series`: el CHECK de su `document_type` sólo
admite tipos de comprobante, y un resumen no lo es.

**ERP**
- `createCashRegister` crea las series de toda caja nueva. Si falla, la caja no se
  revierte —seguiría siendo usable vía fallback— pero se avisa con un toast largo
  y una notificación de tipo `warning`.
- `createInvoiceSeries` / `updateInvoiceSeries` **derivan** `branch_id` de la caja.
  Antes la UI lo mandaba en el payload y `invoiceSeriesSchema` lo descartaba por no
  declararlo, así que la columna estaba siempre en NULL.
- Pestaña Series: aviso de cajas activas sin serie propia, acción "Reasignar caja"
  (conectando `useUpdateInvoiceSeries`, que llevaba desde siempre sin un solo
  consumidor), regex del cliente alineada con la del servidor —`^[A-Z][A-Z0-9]{3}$`
  en vez de `^[A-Z]\d{3}$`, que rechazaba `FC01`— y etiqueta correcta del tipo (las
  seis variantes se mostraban como "Boleta" o "Factura").
- Pull: `cash_registers.branch_id` en full e incremental, `branches` en el
  incremental, `invoice_series.branch_id`, y filtro `is_active` en las series del
  incremental (que no lo tenía).
- `/api/fact/sunat` acción `void`: resuelve el correlativo del resumen, lo pasa al
  adapter, registra el envío en `sunat_summaries` con su ticket —tanto si SUNAT lo
  acepta como si no, porque el correlativo ya se consumió— y escribe
  `invoices.sunat_ticket_status = 'pending'`, columna creada en `00030` que no
  escribía nadie.
- Adapter de Billme: correlativo del RA parametrizado, y **rechazo explícito de
  anular una boleta por RA** (el RA cubre facturas y sus notas; la baja de una
  boleta va por Resumen Diario en estado 3).

**POI Fact**
- `get_next_local_correlative` pasa a `UPDATE ... RETURNING`, atómico bajo el mutex
  de la conexión. SQL extraído a `NEXT_LOCAL_CORRELATIVE_SQL` para poder testearlo.
- Nuevo comando `adopt_server_correlative`: adopta el número real del servidor, pone
  el contador local al día y devuelve si cambió.
- `sync-engine.ts` lo llama tras el push y avisa al cajero de que reimprima cuando
  el número difiere.
- Selección de serie determinista: caja propia → serie compartida (notas) →
  cualquiera con `console.warn`. Se mantiene el fallback porque bloquear una venta
  es peor que un número provisional.

**Webhook de Culqi** — bug nuevo, no estaba en el documento pendiente. El INSERT en
`invoices` pasaba `branch_id`, columna que **no existe** (verificado contra la
base). PostgREST rechazaba el INSERT entero, el `error` no se comprobaba y **cada
pago online se quedaba sin comprobante en silencio**, quemando además un
correlativo de boleta. Los seis `payment_links` existentes están todos en `failed`,
así que no llegó a causar daño. Corregido, con el error comprobado y la selección
de serie ordenada.

## Verificación ejecutada

- `poi-erp`: `npm run build` ✔ (Compiled successfully). `npm run lint` sigue con
  errores preexistentes del proyecto (117), tres menos que antes; ninguno nuevo.
- `kronos-fact`: `npm run build` ✔ (`tsc -b && vite build`).
- `kronos-fact/src-tauri`: `cargo test` ✔ **17 passed**, incluidos dos nuevos:
  `dos_ventas_seguidas_no_repiten_el_correlativo_impreso` y
  `el_pull_no_hace_retroceder_el_correlativo_local`.
- Las migraciones `00038` y `00039` **no se han aplicado**: consultas de
  verificación pre y post en `supabase/migrations/00038_00039_CHECKS.md`.

## Lo que este trabajo NO cubre

El polling de `ConsultarEstadoTicket` sigue sin existir, así que
`sunat_summaries.status` se queda en `pending` y el botón "Anular" del POS sigue
deshabilitado (se anula con NC motivo 01, que es síncrona). Y el punto 0 del
documento pendiente sigue abierto a falta del sondeo con el token de desarrollo de
Billme.
