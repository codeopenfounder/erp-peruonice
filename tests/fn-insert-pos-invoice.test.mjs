/**
 * fn_insert_pos_invoice (migración 00042): el número fiscal y el comprobante con
 * sus líneas se guardan en UNA transacción. Si cualquier INSERT falla, el
 * contador de la serie vuelve atrás y el número no se pierde.
 *
 * Corre la migración real contra un Postgres en memoria (PGlite) con un esquema
 * mínimo que reproduce las restricciones que importan: FK de la apertura de caja,
 * CHECK en las líneas y PK del comprobante.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = new URL(
  "../supabase/migrations/00042_atomic_pos_invoice.sql",
  import.meta.url,
);

const TENANT = "00000000-0000-4000-8000-0000000000aa";
const OTHER_TENANT = "00000000-0000-4000-8000-0000000000bb";
const SERIES = "11111111-1111-4111-8111-111111111111";
const OPENING = "22222222-2222-4222-8222-222222222222";

let db;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;

    CREATE TABLE public.invoice_series (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      current_correlative integer NOT NULL DEFAULT 0
    );
    CREATE TABLE public.cash_register_openings (id uuid PRIMARY KEY);
    CREATE TABLE public.invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      series_id uuid NOT NULL REFERENCES public.invoice_series(id),
      correlative_number integer NOT NULL,
      total numeric(12,2) NOT NULL,
      status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'accepted')),
      opening_id uuid REFERENCES public.cash_register_openings(id) ON DELETE SET NULL,
      issue_date date,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (series_id, correlative_number)
    );
    CREATE TABLE public.invoice_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
      description text NOT NULL,
      quantity numeric(10,3) NOT NULL CHECK (quantity > 0),
      total numeric(12,2) NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await db.exec(readFileSync(MIGRATION, "utf8"));
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`
    DELETE FROM public.invoice_items;
    DELETE FROM public.invoices;
    DELETE FROM public.cash_register_openings;
    DELETE FROM public.invoice_series;
    INSERT INTO public.invoice_series (id, tenant_id, current_correlative) VALUES ('${SERIES}', '${TENANT}', 0);
    INSERT INTO public.cash_register_openings (id) VALUES ('${OPENING}');
  `);
});

let n = 0;
const newId = () => `33333333-3333-4333-8333-${String(++n).padStart(12, "0")}`;

function invoice(overrides = {}) {
  return {
    id: newId(),
    tenant_id: TENANT,
    series_id: SERIES,
    total: 3,
    opening_id: OPENING,
    issue_date: "2026-11-09",
    created_at: "2026-11-10 02:13:13",
    ...overrides,
  };
}
const item = (invoiceId, overrides = {}) => ({
  invoice_id: invoiceId,
  description: "AGUA MINERAL 500 ML",
  quantity: 1,
  total: 3,
  sort_order: 0,
  ...overrides,
});

async function insert(inv, items = []) {
  const { rows } = await db.query(
    "SELECT public.fn_insert_pos_invoice($1::jsonb, $2::jsonb) AS correlative",
    [JSON.stringify(inv), JSON.stringify(items)],
  );
  return rows[0].correlative;
}
async function counter() {
  const { rows } = await db.query(
    "SELECT current_correlative FROM public.invoice_series WHERE id = $1",
    [SERIES],
  );
  return rows[0].current_correlative;
}
async function count(table) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.${table}`);
  return rows[0].n;
}

test("guarda el comprobante y sus líneas con el número siguiente", async () => {
  const inv = invoice();
  assert.equal(await insert(inv, [item(inv.id), item(inv.id, { sort_order: 1 })]), 1);

  const { rows } = await db.query(
    "SELECT correlative_number, status, total::text FROM public.invoices WHERE id = $1",
    [inv.id],
  );
  assert.deepEqual(rows[0], { correlative_number: 1, status: "issued", total: "3.00" });
  assert.equal(await count("invoice_items"), 2);

  const inv2 = invoice();
  assert.equal(await insert(inv2, [item(inv2.id)]), 2);
  assert.equal(await counter(), 2);
});

test("sin líneas también funciona", async () => {
  assert.equal(await insert(invoice()), 1);
  assert.equal(await count("invoices"), 1);
});

test("si una línea falla, no queda ni el comprobante ni el número", async () => {
  const inv = invoice();
  await assert.rejects(insert(inv, [item(inv.id, { quantity: 0 })]), /invoice_items_quantity_check/);

  assert.equal(await counter(), 0, "el número se perdió");
  assert.equal(await count("invoices"), 0);
  assert.equal(await insert(invoice()), 1, "la siguiente venta debe tomar el 1");
});

test("si el comprobante falla (FK de la apertura), el número vuelve atrás", async () => {
  const missingOpening = "44444444-4444-4444-8444-444444444444";
  await assert.rejects(insert(invoice({ opening_id: missingOpening })), /foreign key/);

  assert.equal(await counter(), 0);
  assert.equal(await count("invoices"), 0);
});

test("el mismo comprobante enviado dos veces no quema un segundo número", async () => {
  const inv = invoice();
  assert.equal(await insert(inv), 1);
  await assert.rejects(insert(inv), /duplicate key/);

  assert.equal(await counter(), 1);
  assert.equal(await insert(invoice()), 2);
});

test("el número lo pone la función, no quien llama", async () => {
  await assert.rejects(insert(invoice({ correlative_number: 99 })), /correlative_number/);
  assert.equal(await counter(), 0);
});

test("serie inexistente: error y nada guardado", async () => {
  await assert.rejects(
    insert(invoice({ series_id: "55555555-5555-4555-8555-555555555555" })),
    /serie/i,
  );
  assert.equal(await count("invoices"), 0);
});

test("una serie de otro tenant no se toca", async () => {
  await assert.rejects(insert(invoice({ tenant_id: OTHER_TENANT })), /no existe para este tenant/);
  assert.equal(await counter(), 0);
  assert.equal(await count("invoices"), 0);
});

test("sin tenant_id no guarda nada", async () => {
  const inv = invoice();
  delete inv.tenant_id;
  await assert.rejects(insert(inv), /tenant_id/);
  assert.equal(await counter(), 0);
});

test("la migración se puede volver a ejecutar sin error", async () => {
  await db.exec(readFileSync(MIGRATION, "utf8"));
  assert.equal(await insert(invoice()), 1);
});

test("solo service_role puede ejecutarla", async () => {
  const { rows } = await db.query(`
    SELECT r AS role, has_function_privilege(r, 'public.fn_insert_pos_invoice(jsonb, jsonb)', 'EXECUTE') AS can
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r
  `);
  assert.deepEqual(rows, [
    { role: "anon", can: false },
    { role: "authenticated", can: false },
    { role: "service_role", can: true },
  ]);
});
