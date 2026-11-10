/**
 * insertPosInvoice: asegura la apertura de caja y guarda el comprobante con su
 * número en una sola llamada (fn_insert_pos_invoice, migración 00042).
 *
 * La atomicidad la prueba tests/fn-insert-pos-invoice.test.mjs contra Postgres.
 * Aquí se prueba el orden: la apertura tiene que existir ANTES de guardar,
 * porque `invoices.opening_id` es FK y una apertura recién hecha en el POS sólo
 * llega al servidor con el heartbeat. Pasó el 2026-11-09 con la primera venta
 * tras abrir caja: el ticket decía 00000001 y SUNAT recibió el 00000002.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { insertPosInvoice } from "../src/lib/invoice-correlative.ts";

const OPENING = "973960e3-0000-4000-8000-000000000000";

/** Cliente falso: registra el orden de las llamadas y lo que recibe la RPC. */
function fakeClient({ openings = [], insertError = null, rpcError = null } = {}) {
  const known = new Set(openings);
  const calls = [];
  const rpcArgs = [];
  let counter = 0;
  return {
    calls,
    rpcArgs,
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
    async rpc(fn, args) {
      calls.push(`rpc:${fn}`);
      rpcArgs.push(args);
      if (rpcError) return { data: null, error: rpcError };
      counter += 1;
      return { data: counter, error: null };
    },
  };
}

const invoice = { id: "inv-1", series_id: "series-b003", total: 3, opening_id: OPENING };
const items = [{ invoice_id: "inv-1", description: "AGUA MINERAL 500 ML", quantity: 1 }];
const input = {
  tenantId: "tenant",
  userId: "user",
  openingId: OPENING,
  cashRegisterId: "caja",
  invoice,
  items,
};

test("primera venta tras abrir caja: crea la apertura ANTES de guardar", async () => {
  const db = fakeClient();
  const result = await insertPosInvoice(db, input);

  assert.deepEqual(result, { ok: true, correlative: 1 });
  assert.deepEqual(db.calls, [
    "select:cash_register_openings",
    "insert:cash_register_openings",
    "rpc:fn_insert_pos_invoice",
  ]);
});

test("comprobante y líneas viajan juntos en una sola llamada", async () => {
  const db = fakeClient({ openings: [OPENING] });
  await insertPosInvoice(db, input);

  assert.deepEqual(db.rpcArgs, [{ p_invoice: invoice, p_items: items }]);
});

test("apertura ya sincronizada: no la vuelve a crear", async () => {
  const db = fakeClient({ openings: [OPENING] });
  const result = await insertPosInvoice(db, input);

  assert.deepEqual(result, { ok: true, correlative: 1 });
  assert.deepEqual(db.calls, ["select:cash_register_openings", "rpc:fn_insert_pos_invoice"]);
});

test("sin apertura (p. ej. nota sin caja): guarda directamente", async () => {
  const db = fakeClient();
  const result = await insertPosInvoice(db, { ...input, openingId: null });

  assert.deepEqual(result, { ok: true, correlative: 1 });
  assert.deepEqual(db.calls, ["rpc:fn_insert_pos_invoice"]);
});

test("otra petición creó la apertura a la vez (23505): sigue y guarda", async () => {
  const db = fakeClient({ insertError: { code: "23505", message: "duplicate key" } });
  const result = await insertPosInvoice(db, input);

  assert.deepEqual(result, { ok: true, correlative: 1 });
  assert.equal(db.calls.at(-1), "rpc:fn_insert_pos_invoice");
});

test("si la apertura no se puede crear, no intenta guardar", async () => {
  const db = fakeClient({ insertError: { code: "08006", message: "connection failure" } });
  const result = await insertPosInvoice(db, input);

  assert.equal(result.ok, false);
  assert.match(result.error, /apertura de caja/);
  assert.ok(!db.calls.includes("rpc:fn_insert_pos_invoice"));
});

test("si la base rechaza el comprobante, devuelve su error", async () => {
  const db = fakeClient({
    openings: [OPENING],
    rpcError: { code: "23514", message: 'violates check constraint "invoice_items_quantity_check"' },
  });
  const result = await insertPosInvoice(db, input);

  assert.deepEqual(result, {
    ok: false,
    error: 'violates check constraint "invoice_items_quantity_check"',
  });
});
