/**
 * El número fiscal de un comprobante del POS se pide DESPUÉS de asegurar todo lo
 * que puede hacer fallar el INSERT.
 *
 * fn_next_correlative() es irreversible: si el INSERT del comprobante falla
 * después, el número se pierde y el ticket impreso por el POS deja de coincidir
 * con el comprobante ante SUNAT («se emitió con el número 00000002, distinto del
 * impreso en el ticket»). Pasó el 2026-11-09 con la primera venta tras abrir
 * caja: la apertura aún no estaba en el servidor y `invoices.opening_id` es FK.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveInvoiceCorrelative } from "../src/lib/invoice-correlative.ts";

const OPENING = "973960e3-0000-4000-8000-000000000000";

/** Cliente falso: registra el orden de las llamadas y simula la FK de aperturas. */
function fakeClient({ openings = [], insertError = null } = {}) {
  const known = new Set(openings);
  const calls = [];
  let counter = 0;
  return {
    calls,
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq(_column, value) {
          query.id = value;
          return query;
        },
        async maybeSingle() {
          calls.push(`select:${table}`);
          return { data: known.has(query.id) ? { id: query.id } : null, error: null };
        },
        async insert(row) {
          calls.push(`insert:${table}`);
          if (insertError) return { data: null, error: insertError };
          known.add(row.id);
          return { data: null, error: null };
        },
      };
      return query;
    },
    async rpc(fn) {
      calls.push(`rpc:${fn}`);
      counter += 1;
      return { data: counter, error: null };
    },
  };
}

const input = {
  tenantId: "tenant",
  userId: "user",
  seriesId: "series-b003",
  openingId: OPENING,
  cashRegisterId: "caja",
};

test("primera venta tras abrir caja: crea la apertura ANTES de pedir el número", async () => {
  const db = fakeClient();
  const result = await reserveInvoiceCorrelative(db, input);

  assert.deepEqual(result, { ok: true, correlative: 1 });
  assert.deepEqual(db.calls, [
    "select:cash_register_openings",
    "insert:cash_register_openings",
    "rpc:fn_next_correlative",
  ]);
});

test("apertura ya sincronizada: no la vuelve a crear", async () => {
  const db = fakeClient({ openings: [OPENING] });
  const result = await reserveInvoiceCorrelative(db, input);

  assert.deepEqual(result, { ok: true, correlative: 1 });
  assert.deepEqual(db.calls, ["select:cash_register_openings", "rpc:fn_next_correlative"]);
});

test("sin apertura (p. ej. nota sin caja): pide el número directamente", async () => {
  const db = fakeClient();
  const result = await reserveInvoiceCorrelative(db, { ...input, openingId: null });

  assert.deepEqual(result, { ok: true, correlative: 1 });
  assert.deepEqual(db.calls, ["rpc:fn_next_correlative"]);
});

test("otra petición creó la apertura a la vez (23505): sigue y toma el número", async () => {
  const db = fakeClient({ insertError: { code: "23505", message: "duplicate key" } });
  const result = await reserveInvoiceCorrelative(db, input);

  assert.deepEqual(result, { ok: true, correlative: 1 });
  assert.equal(db.calls.at(-1), "rpc:fn_next_correlative");
});

test("si la apertura no se puede crear, NO consume el número", async () => {
  const db = fakeClient({ insertError: { code: "08006", message: "connection failure" } });
  const result = await reserveInvoiceCorrelative(db, input);

  assert.equal(result.ok, false);
  assert.match(result.error, /apertura de caja/);
  assert.ok(!db.calls.includes("rpc:fn_next_correlative"), "se consumió un número que se iba a perder");
});
