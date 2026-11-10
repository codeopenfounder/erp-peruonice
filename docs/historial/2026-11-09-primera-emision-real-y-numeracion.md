# Primera emisión real a SUNAT y números de comprobante que no se pierden

**Fecha**: 2026-11-09
**Alcance**: `erp-peruonice` (PR #8, #9 y el de la migración 00042), `poi-fact` 1.0.5

## Qué se buscaba

Emitir el primer comprobante real. Desde el corte a Billme del 2026-08-09 no se
había aceptado ninguno: la Clave SOL fallaba y la PC de desarrollo se perdió poco
después, con el instalador 1.0.4 sin probar contra producción.

## Lo que se encontró, en orden

### 1. La empresa de Billme estaba creada con el usuario SOL principal

SUNAT no acepta el principal para el servicio de envío: responde `0112` («el
usuario debe ser secundario», ya visto el 2026-08-09). Se creó un usuario
secundario solo con el perfil «SEE - Del Contribuyente y Envío de Documentos» y
la empresa de Billme se rehízo con él. «Verificar» devolvió `0127` sobre un
comprobante inventado: SUNAT autenticó.

Antes, con una empresa de Billme en desarrollo, se probó la beta: la boleta normal
se aceptó y la boleta con una cortesía se rechazó con `2638`. Billme no genera en
el XML el total de operaciones gratuitas (tributo 9996) ni la leyenda 1002, y su
API no tiene campo para enviarlos. `emit_free_lines` sigue apagado; la pregunta
está hecha al soporte de Billme.

### 2. El POS 1.0.4 no sincronizaba («Error sync»)

Desde la 1.0.3 el POS manda la cabecera `X-POI-Device-Id` en cada petición
autenticada, y el CORS de `/api/fact/*` solo permitía `Content-Type` y
`Authorization`. WebView2 bloqueaba la petición en el preflight y el POS solo veía
`Failed to fetch`. El login con PIN no lleva esa cabecera, por eso se podía entrar
pero no cargaba nada. PR #8, con un test de contrato (`tests/cors-contract.test.mjs`).

### 3. La serie B001 choca con otra fuente de emisión

La primera venta salió como B001-00000311 y SUNAT la rechazó con `1033`: ya tenía
un B001-00000311 registrado con otros datos. Es el tercer síntoma del mismo choque
(B001-00000065 en mayo, B001-00000307 con `0140` en agosto). Algo más emite con la
serie B001 para este RUC. **No está identificado.** El POS pasó a una serie propia,
B003, y la boleta B003-00000002 fue la **primera aceptada en producción**.

### 4. La primera venta tras abrir caja salía con otro número

El ticket decía 00000001 y SUNAT recibía el 00000002. `invoices.opening_id` es FK a
`cash_register_openings`, y una apertura recién hecha solo llega al servidor con el
heartbeat (cada 2 min). El push tomaba el número, el INSERT fallaba por la FK, el
número se perdía y el reintento salía con el siguiente. Se vio en la SQLite del POS:
las dos ventas afectadas eran de 6 y 22 segundos después de abrir caja. PR #9
asegura la apertura antes de pedir el número.

### 5. La clase entera: número y comprobante en una transacción

El PR #9 arregló la causa concreta, pero cualquier otro fallo del INSERT seguía
quemando el número: cada llamada de PostgREST es su propia transacción. La
migración 00042 añade `fn_insert_pos_invoice`, que sube el contador e inserta
comprobante y líneas en una sola transacción; si algo falla, el contador vuelve
atrás. Detalles en la cabecera de la migración y en `00042_CHECKS.md`.

Probado con PGlite (Postgres en WASM): `tests/fn-insert-pos-invoice.test.mjs` corre
la migración real sobre un esquema mínimo. Aparte, y solo como evidencia, se
reprodujeron las 41 migraciones y se probó la función contra las tablas reales con
una venta con la forma exacta del route; tres migraciones no se reproducen fuera de
producción (una política duplicada y la tabla `expense_fund_movements`, que no se
creó por migración).

### 6. El POS descartaba en silencio las ventas que no subían

Por eso el punto 4 pasó inadvertido. El POS 1.0.5 avisa una vez por venta y motivo,
muestra «N sin subir» en la barra de estado y confirma cuando por fin suben.

## Pendientes

- Identificar quién más emite con la serie B001.
- Responder de Billme sobre operaciones gratuitas (9996 / 1002).
- `fact_config.detraction_account` sigue vacío.
- Probar una nota de crédito (la serie `BC01` nunca se ha usado).
- Instalar el POS 1.0.5 en las cajas.
- Los huecos de numeración viejos (B001 308–310, B003 1) se quedan así: esos
  números nunca llegaron a SUNAT.
