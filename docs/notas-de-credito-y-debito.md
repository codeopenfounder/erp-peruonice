# Notas de crédito y débito: efectos en stock y caja

Fuente única: **`src/lib/sunat/note-effects.ts`**, duplicado byte a byte en
`kronos-fact/src/lib/sunat/note-effects.ts`. Cualquier cambio va en los dos.

Antes de que existiera este módulo, la regla "qué le hace esta nota al stock y a
la caja" estaba escrita **seis** veces: la UI del POS, `insert_invoice` en Rust,
el push del ERP, la anulación del ERP, el ticket impreso y el PDF. Las seis
divergieron. Los síntomas eran una NC motivo 02 que creaba en local un `refund`
que el servidor nunca creaba, una nota de débito clasificada `nd_charge` en el
POS y `sale` en el ERP, y una ND motivo 02 que restaba inventario.

Hoy quedan dos copias: la de TypeScript, compartida, y la de Rust
(`db_commands.rs` y `print_commands.rs`), que no puede importarla.

---

## La matriz

SUNAT **no regula** el efecto en stock ni en caja: los catálogos 09 y 10 son
codificación tributaria y el efecto físico es consecuencia contable del hecho
económico. Lo que sigue es la matriz que aplica el sistema.

### Catálogo 09 — notas de crédito

| Cód | Motivo | Inventario | Caja | Sobre |
|---|---|---|---|---|
| 01 | Anulación de la operación | **entra** | sale | factura y boleta |
| 02 | Anulación por error en el RUC | — | — | solo factura |
| 03 | Corrección de la descripción | — | — | factura y boleta |
| 04 | Descuento global | — | sale | **solo factura** |
| 05 | Descuento por ítem | — | sale | **solo factura** |
| 06 | Devolución total | **entra** | sale | factura y boleta, **no servicios** |
| 07 | Devolución por ítem | **entra** | sale | factura y boleta, **no servicios** |
| 08 | Bonificación | **SALE** | — | **solo factura**, **no servicios** |
| 09 | Disminución en el valor | — | sale | factura y boleta |
| 10 | Otros conceptos | — | sale | factura y boleta |

### Catálogo 10 — notas de débito

| Cód | Motivo | Inventario | Caja |
|---|---|---|---|
| 01 | Intereses por mora | — | entra |
| 02 | Aumento en el valor | — | entra |
| 03 | Penalidades / otros cargos | — | entra |

**Ninguna nota de débito mueve inventario, nunca.**

---

## Por qué cada restricción

**Los motivos 04, 05 y 08 están prohibidos sobre boleta.** El art. 10 num. 1.4
del Reglamento de Comprobantes de Pago: *"Tratándose de operaciones con
consumidores finales, los descuentos o bonificaciones deberán constar en el mismo
comprobante de pago."* Reforzado por el art. 22.1 de la RS 097-2012. El POS los
ofrecía sobre cualquier boleta.

**Los motivos 06 y 07 no aplican a servicios.** No hay nada que devolver de un
servicio ya prestado. El art. 26 b) de la Ley del IGV condiciona la anulación a
que el servicio no se haya realizado, y las RTF 06741-4-2020 y 4831-9-2012 exigen
prueba objetiva. Para una entrada ya consumida el motivo correcto es el **09**
(disminución en el valor), no el 06.

**El motivo 08 es el único que SACA stock.** Es una bonificación en especie: se
entrega mercadería gratis además de lo facturado, así que el inventario baja. No
existía en el diálogo del POS.

**Ninguna ND mueve inventario.** Entregar bienes adicionales es una operación
nueva y exige su propio comprobante (Decreto Ley 25632, art. 2). El POS ofrecía
un subtipo "cantidad" en el motivo 02 que entregaba unidades extra y restaba
stock; se eliminó.

**El reingreso de stock es al COSTO**, nunca al precio de venta.

---

## Efecto en caja: qué sale del cajón

Un movimiento `refund` **no** implica que salga efectivo. Solo sale efectivo si
la venta original se cobró en efectivo; con tarjeta la devolución va por el
adquirente y no toca el cajón.

Por eso el movimiento conserva el `payment_method` del comprobante original y
`get_opening_summary` (Rust) calcula:

```
efectivo esperado = apertura
                  + ventas en efectivo
                  + saldo de caja chica
                  + ingresos en efectivo      ← incluye ND cobradas en efectivo
                  − devoluciones en efectivo  ← solo las de método `cash`
                  − egresos
```

Antes restaba el 100 % de las devoluciones sin mirar el método de pago, así que
devolver una venta con tarjeta descuadraba el arqueo por el importe completo, y
no sumaba `total_income`, así que una ND cobrada en efectivo hacía que la caja
apareciera "sobrando".

## A qué caja va una devolución

**Una caja cerrada y arqueada no se reabre.** Una devolución diferida va a la
caja abierta hoy, con referencia cruzada al comprobante original. La anulación
desde el ERP creaba sintéticamente la apertura original con `status: "open"` si
ya no existía; ahora busca la apertura abierta de esa caja y, si no hay ninguna,
completa la anulación ante SUNAT y devuelve un aviso de que la devolución no se
anotó en caja.

---

## La re-emisión no cobra dos veces

Tras una NC motivo 02, POI Fact re-emite el comprobante con el RUC correcto. La
re-emisión **hereda** el cobro y la salida de stock del original
(`invoices.reissue_of_invoice_id`), de modo que la NC y la nueva factura se
neteen: efecto neto en resultados, cero.

| Paso | Stock | Caja |
|---|---|---|
| Venta original | −N | +T |
| NC motivo 02 | sin efecto | sin efecto |
| Re-emisión | **sin efecto** | **sin efecto** |

Además el carrito se carga **verbatim** desde `invoice_items`: antes pasaba por
`addItem`, que descartaba los ítems sin `product_id` o con precio 0 — es decir,
**cortesías e insumos desaparecían** de la factura corregida — y podía omitir en
silencio un producto cuyo stock estuviera agotado.

Si el comprobante original no está en el servidor (nunca se sincronizó), el push
registra la re-emisión **como venta normal**: su cobro y su salida de stock
tampoco están, así que es la única forma de que se cuenten una vez.

---

## Qué NO cubre esta matriz

No está en vigor todavía, pero conviene tenerlo presente: la **RS 000048-2026**
introduce que una nota solo pueda modificar **un** comprobante y una ND de
penalidades inafecta al IGV. La **RS 000143-2026/SUNAT** (29.7.2026) la postergó
al **1 de enero de 2027**; las designaciones de nuevos emisores, al 1 de abril de
2027.

Los códigos 11 (ajustes de exportación), 12 (IVAP) y 13 (monto neto pendiente)
del catálogo 09 quedan fuera a propósito: no aplican a este negocio, y el `CHECK`
de `invoices.reference_reason` (migración 00037) los rechaza.
