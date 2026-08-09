import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

function loadDotEnvLocal(): Record<string, string> {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

const env = loadDotEnvLocal();

/**
 * Credenciales de las pruebas — NUNCA literales en el código.
 *
 * Estaban escritas a mano aquí y en `auth.setup.ts`: la contraseña del superusuario
 * de Postgres y la del administrador del ERP en producción, en un repositorio
 * **público**. Ahora salen de `.env.local`, que está en `.gitignore`.
 *
 * Que ya no estén en el código NO las descompromete: el historial público las
 * conserva. Hay que rotarlas — ver `docs/pendiente-notas-y-multipos.md`.
 */
function required(name: string): string {
  const value = env[name] ?? process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name}. Defínela en poi-erp/.env.local para poder correr los e2e.`,
    );
  }
  return value;
}

const PG_PASSWORD = required("E2E_PG_PASSWORD");
const TEST_EMAIL = required("E2E_TEST_EMAIL");
const TEST_PASSWORD = required("E2E_TEST_PASSWORD");

function pgClient() {
  return new Client({
    host: "db.ctlvfkiwpmyljeofgitz.supabase.co",
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: PG_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

async function getFactBearerToken(): Promise<string> {
  const supa = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supa.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`Supabase auth failed: ${error?.message ?? "no session"}`);
  }
  return data.session.access_token;
}

test.describe("Smoke fixes (post-Codex)", () => {
  test.describe.configure({ mode: "serial" });

  test("A - migración 00028: recrear categoría tras soft-delete no debe violar idx_product_categories_unique_name", async () => {
    const client = pgClient();
    await client.connect();
    const stamp = Date.now();
    const testName = `SmokeCat-${stamp}`;
    const insertedIds: string[] = [];

    try {
      const tenantRes = await client.query<{ id: string }>("SELECT id FROM tenants LIMIT 1");
      expect(tenantRes.rows[0]?.id, "Debe existir al menos un tenant").toBeTruthy();
      const tenantId = tenantRes.rows[0].id;

      const ins1 = await client.query<{ id: string }>(
        `INSERT INTO public.product_categories (tenant_id, name, type, is_active)
         VALUES ($1, $2, 'product', true) RETURNING id`,
        [tenantId, testName],
      );
      insertedIds.push(ins1.rows[0].id);

      await client.query(
        `UPDATE public.product_categories SET is_active = false WHERE id = $1`,
        [ins1.rows[0].id],
      );

      const ins2 = await client.query<{ id: string }>(
        `INSERT INTO public.product_categories (tenant_id, name, type, is_active)
         VALUES ($1, $2, 'product', true) RETURNING id`,
        [tenantId, testName],
      );
      insertedIds.push(ins2.rows[0].id);
      expect(ins2.rows[0].id).toBeTruthy();

      let dupError: { code?: string } | null = null;
      try {
        await client.query(
          `INSERT INTO public.product_categories (tenant_id, name, type, is_active)
           VALUES ($1, $2, 'product', true)`,
          [tenantId, testName],
        );
      } catch (e) {
        dupError = e as { code?: string };
      }
      expect(dupError?.code, "El índice parcial debe seguir bloqueando duplicados activos").toBe("23505");
    } finally {
      if (insertedIds.length > 0) {
        await client.query(
          `DELETE FROM public.product_categories WHERE id = ANY($1::uuid[])`,
          [insertedIds],
        );
      }
      await client.end();
    }
  });

  test("A2 - migración 00028 también aplica a product_tags", async () => {
    const client = pgClient();
    await client.connect();
    const stamp = Date.now();
    const catName = `SmokeCatForTag-${stamp}`;
    const tagName = `SmokeTag-${stamp}`;
    const insertedCatIds: string[] = [];
    const insertedTagIds: string[] = [];

    try {
      const tenantRes = await client.query<{ id: string }>("SELECT id FROM tenants LIMIT 1");
      const tenantId = tenantRes.rows[0].id;

      const cat = await client.query<{ id: string }>(
        `INSERT INTO public.product_categories (tenant_id, name, type, is_active)
         VALUES ($1, $2, 'product', true) RETURNING id`,
        [tenantId, catName],
      );
      insertedCatIds.push(cat.rows[0].id);
      const catId = cat.rows[0].id;

      const tag1 = await client.query<{ id: string }>(
        `INSERT INTO public.product_tags (tenant_id, category_id, name, is_active)
         VALUES ($1, $2, $3, true) RETURNING id`,
        [tenantId, catId, tagName],
      );
      insertedTagIds.push(tag1.rows[0].id);

      await client.query(
        `UPDATE public.product_tags SET is_active = false WHERE id = $1`,
        [tag1.rows[0].id],
      );

      const tag2 = await client.query<{ id: string }>(
        `INSERT INTO public.product_tags (tenant_id, category_id, name, is_active)
         VALUES ($1, $2, $3, true) RETURNING id`,
        [tenantId, catId, tagName],
      );
      insertedTagIds.push(tag2.rows[0].id);
      expect(tag2.rows[0].id).toBeTruthy();
    } finally {
      if (insertedTagIds.length > 0) {
        await client.query(
          `DELETE FROM public.product_tags WHERE id = ANY($1::uuid[])`,
          [insertedTagIds],
        );
      }
      if (insertedCatIds.length > 0) {
        await client.query(
          `DELETE FROM public.product_categories WHERE id = ANY($1::uuid[])`,
          [insertedCatIds],
        );
      }
      await client.end();
    }
  });

});

test.describe("Smoke fixes - UI navigation (prefetch)", () => {
  // En `next dev` la primera visita a una ruta compila el código on-the-fly (~5-7s).
  // Esto NO es prefetch lento: es el SWC compilando. Para medir el efecto real del
  // prefetch + staleTime, hacemos warm-up (navega a ambas rutas) y luego medimos
  // el segundo viaje (rutas ya compiladas, queries ya en cache).

  async function expandInventarioIfNeeded(page: import("@playwright/test").Page) {
    const serviciosVisible = await page
      .getByRole("link", { name: /^servicios$/i })
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (serviciosVisible) return;

    const inventarioHeader = page.getByRole("button", { name: /^inventario$/i }).first();
    if (await inventarioHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await inventarioHeader.click();
      await page.waitForTimeout(400);
    }
  }

  test("B - navegación productos↔servicios usa prefetch (SPA navigation, warmed)", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/inventario/productos");
    await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible({ timeout: 60000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // useEffect de prefetch programático

    await expandInventarioIfNeeded(page);

    // ---- WARM-UP: compila /servicios y /productos en next dev ----
    await page.getByRole("link", { name: /^servicios$/i }).first().click();
    await expect(page.getByRole("heading", { name: "Servicios" })).toBeVisible({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    await page.getByRole("link", { name: /^productos$/i }).first().click();
    await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // ---- MEDICIÓN: rutas ya compiladas, valida prefetch + cache ----
    const t0 = Date.now();
    await page.getByRole("link", { name: /^servicios$/i }).first().click();
    await expect(page.getByRole("heading", { name: "Servicios" })).toBeVisible({ timeout: 5000 });
    const deltaPS = Date.now() - t0;
    console.log(`[Smoke B] productos -> servicios (warmed): ${deltaPS}ms`);
    // Umbral 4500ms: mide mejora real vs los ~5000ms+ que reportó el usuario.
    // En aislamiento típicamente da ~2000-2300ms; bajo carga (3 workers) sube hasta ~3500ms.
    expect(deltaPS, `productos→servicios warmed: ${deltaPS}ms (objetivo <4500, antes ~5000+)`).toBeLessThan(4500);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const t1 = Date.now();
    await page.getByRole("link", { name: /^productos$/i }).first().click();
    await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible({ timeout: 5000 });
    const deltaSP = Date.now() - t1;
    console.log(`[Smoke B] servicios -> productos (warmed): ${deltaSP}ms`);
    expect(deltaSP, `servicios→productos warmed: ${deltaSP}ms (objetivo <4500, antes ~5000+)`).toBeLessThan(4500);
  });
});

test.describe("Smoke fixes - ApiPeru endpoints", () => {
  test("C - /api/fact/{dni,ruc,exchange-rate} responden con APIPERU_API_TOKEN cargado", async ({ request, baseURL }) => {
    const token = await getFactBearerToken();
    const headers = { Authorization: `Bearer ${token}` };
    const base = baseURL ?? "http://localhost:3000";

    // Exchange rate (no requiere auth)
    const exRes = await request.get(`${base}/api/fact/exchange-rate`);
    expect(exRes.status(), "exchange-rate debe responder 200").toBe(200);
    const exData = await exRes.json();
    console.log(`[Smoke C] exchange-rate:`, exData);
    expect(exData.success, "exchange-rate debe success=true").toBe(true);
    expect(typeof exData.compra, "compra debe ser número").toBe("number");
    expect(typeof exData.venta, "venta debe ser número").toBe("number");
    expect(exData.source, "source no debe ser fallback (significa ApiPeru funciona)").not.toBe("fallback");

    // RUC público de SUNAT (siempre válido)
    const rucRes = await request.get(`${base}/api/fact/ruc/20131312955`, { headers });
    console.log(`[Smoke C] RUC status: ${rucRes.status()}`);
    expect([200, 404]).toContain(rucRes.status());
    if (rucRes.status() === 200) {
      const rucData = await rucRes.json();
      console.log(`[Smoke C] RUC payload:`, rucData);
      expect(rucData.success).toBe(true);
      expect(rucData.data?.razon_social).toBeTruthy();
    }

    // DNI dummy: ApiPeru puede devolver 5xx para DNIs claramente inválidos (12345678).
    // Lo que NO queremos ver es un 500 con error "APIPERU_API_TOKEN no configurada".
    // El éxito de exchange-rate y RUC arriba ya prueba que el token funciona.
    const dniRes = await request.get(`${base}/api/fact/dni/12345678`, { headers });
    const dniBody = await dniRes.json().catch(() => ({}));
    console.log(`[Smoke C] DNI status=${dniRes.status()} body=`, dniBody);
    expect(
      typeof dniBody.error === "string" ? dniBody.error : "",
      `DNI no debe fallar por token faltante (exchange-rate y RUC ya probaron que el token está OK)`,
    ).not.toMatch(/APIPERU_API_TOKEN/i);
    expect(dniRes.status()).not.toBe(401);
  });
});
