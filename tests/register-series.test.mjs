/**
 * pickRegisterSeries: qué series recibe una caja nueva.
 *
 * El 2026-11-14 crear «CAJA 2» falló al insertar B002/F002, que ya existían sin
 * caja tras borrar otra. Y la B001/F001 no se puede volver a usar: Symple POS
 * la gastó hasta la B001-00022806 y SUNAT rechaza cada número con 1033.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRegisterSeries, registerNumber } from "../src/lib/register-series.ts";

const CAJA_A = "aaaaaaaa-0000-4000-8000-000000000000";
const s = (code, documentType, cashRegisterId = null, isActive = true) => ({
  id: `id-${code}`,
  series_code: code,
  document_type: documentType,
  cash_register_id: cashRegisterId,
  is_active: isActive,
});

test("registerNumber lee el número de CAJA-NN", () => {
  assert.equal(registerNumber("CAJA-03"), 3);
  assert.equal(registerNumber("CAJA-12"), 12);
  assert.equal(registerNumber("Caja Principal"), null);
});

test("sin series previas se crea la del número de la caja", () => {
  assert.deepEqual(pickRegisterSeries("boleta", 3, []), { action: "create", code: "B003" });
  assert.deepEqual(pickRegisterSeries("factura", 3, []), { action: "create", code: "F003" });
});

test("una serie sin caja y activa se reutiliza (el caso de CAJA 2)", () => {
  const existing = [s("B002", "boleta"), s("F002", "factura")];
  assert.deepEqual(pickRegisterSeries("boleta", 2, existing), { action: "reuse", code: "B002", id: "id-B002" });
  assert.deepEqual(pickRegisterSeries("factura", 2, existing), { action: "reuse", code: "F002", id: "id-F002" });
});

test("una serie de otra caja se salta y se toma la siguiente libre", () => {
  const existing = [s("B003", "boleta", CAJA_A), s("B004", "boleta"), s("F003", "factura", CAJA_A)];
  assert.deepEqual(pickRegisterSeries("boleta", 3, existing), { action: "reuse", code: "B004", id: "id-B004" });
  assert.deepEqual(pickRegisterSeries("factura", 3, existing), { action: "create", code: "F004" });
});

test("B001 y F001 nunca se dan, aunque estén libres", () => {
  const existing = [s("B001", "boleta"), s("F001", "factura")];
  assert.deepEqual(pickRegisterSeries("boleta", 1, existing), { action: "create", code: "B002" });
  assert.deepEqual(pickRegisterSeries("factura", 1, existing), { action: "create", code: "F002" });
});

test("una serie desactivada no se reactiva", () => {
  const existing = [s("B005", "boleta", null, false)];
  assert.deepEqual(pickRegisterSeries("boleta", 5, existing), { action: "create", code: "B006" });
});
