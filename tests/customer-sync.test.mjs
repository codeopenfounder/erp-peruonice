/**
 * syncPosCustomers: un cliente creado en el POS con un documento que ya existe
 * en el servidor no debe dejar la venta atascada.
 *
 * Pasó el 2026-11-14: en la caja se creó con el alta rápida un cliente cuyo DNI
 * ya estaba en el ERP. El upsert chocó con `idx_customers_tenant_doc`, el error se
 * ignoró y la boleta B004-00000001 falló en bucle con `invoices_customer_id_fkey`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncPosCustomers } from "../src/lib/customer-sync.ts";

const TENANT = "00000000-0000-4000-8000-0000000000aa";
const SERVER_ID = "22222222-0000-4000-8000-000000000000";
const LOCAL_ID = "11111111-0000-4000-8000-000000000000";

/**
 * Cliente falso con la regla de unicidad de la tabla real:
 * (tenant_id, document_type, document_number), NULL distinto de todo.
 */
function fakeClient(existing = [], { failWith = null } = {}) {
  const rows = existing.map((r) => ({ ...r }));
  return {
    rows,
    from(table) {
      assert.equal(table, "customers");
      const filters = {};
      const query = {
        async upsert(row) {
          if (failWith) return { error: failWith };
          const sameId = rows.find((r) => r.id === row.id);
          const sameDoc = rows.find(
            (r) =>
              r.id !== row.id &&
              r.tenant_id === row.tenant_id &&
              r.document_type === row.document_type &&
              r.document_number != null &&
              r.document_number === row.document_number,
          );
          if (sameDoc) {
            return { error: { code: "23505", message: "duplicate key value violates unique constraint \"idx_customers_tenant_doc\"" } };
          }
          if (sameId) Object.assign(sameId, row);
          else rows.push({ ...row });
          return { error: null };
        },
        select() {
          return query;
        },
        eq(column, value) {
          filters[column] = value;
          return query;
        },
        async maybeSingle() {
          const hit = rows.find((r) => Object.entries(filters).every(([c, v]) => r[c] === v));
          return { data: hit ? { id: hit.id } : null, error: null };
        },
      };
      return query;
    },
  };
}

const cliente = (id) => ({
  id,
  document_type: "dni",
  document_number: "12345678",
  legal_name: "Cliente de Prueba",
});

test("un cliente nuevo se guarda y su id no cambia", async () => {
  const client = fakeClient();
  const { results, resolveId } = await syncPosCustomers(client, TENANT, [cliente(LOCAL_ID)]);
  assert.deepEqual(results, [{ id: LOCAL_ID, success: true }]);
  assert.equal(resolveId(LOCAL_ID), LOCAL_ID);
  assert.equal(client.rows.length, 1);
});

test("un documento que ya existía enlaza la venta al cliente del servidor", async () => {
  const client = fakeClient([{ ...cliente(SERVER_ID), tenant_id: TENANT }]);
  const { results, resolveId } = await syncPosCustomers(client, TENANT, [
    cliente(SERVER_ID),
    cliente(LOCAL_ID),
  ]);
  assert.deepEqual(results, [
    { id: SERVER_ID, success: true },
    { id: LOCAL_ID, success: true },
  ]);
  assert.equal(resolveId(LOCAL_ID), SERVER_ID);
  assert.equal(resolveId(SERVER_ID), SERVER_ID);
  assert.equal(client.rows.length, 1, "no se crea un segundo cliente con el mismo DNI");
});

test("«sin documento» nunca se enlaza a otra persona: la venta sube sin cliente", async () => {
  const otro = { id: SERVER_ID, tenant_id: TENANT, document_type: "sin_documento", document_number: "", legal_name: "Cliente varios" };
  const client = fakeClient([otro]);
  const { results, resolveId } = await syncPosCustomers(client, TENANT, [
    { id: LOCAL_ID, document_type: "sin_documento", document_number: "", legal_name: "Juan" },
  ]);
  assert.deepEqual(results, [{ id: LOCAL_ID, success: false }]);
  assert.equal(resolveId(LOCAL_ID), null);
});

test("cualquier otro fallo deja la venta sin cliente en vez de atascarla", async () => {
  const client = fakeClient([], { failWith: { code: "23502", message: "null value in column" } });
  const { results, resolveId } = await syncPosCustomers(client, TENANT, [cliente(LOCAL_ID)]);
  assert.deepEqual(results, [{ id: LOCAL_ID, success: false }]);
  assert.equal(resolveId(LOCAL_ID), null);
});

test("un id que no vino en el push se deja igual, y null sigue siendo null", async () => {
  const { resolveId } = await syncPosCustomers(fakeClient(), TENANT, []);
  assert.equal(resolveId(SERVER_ID), SERVER_ID);
  assert.equal(resolveId(null), null);
});
