import { test, expect } from "@playwright/test";
import { Client } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";

const PROMO_CODE = "TEST-E2E-01";
const PROMO_NAME = "Descuento E2E 10%";
const PROMO_NAME_EDITED = "Descuento E2E 15%";

/**
 * Contraseña del superusuario de Postgres — NUNCA literal en el código.
 *
 * Estaba escrita a mano aquí, y este repositorio es **público**. Que ya no esté no
 * la descompromete: el historial la conserva. Hay que rotarla — ver el runbook en
 * `docs/pendiente-notas-y-multipos.md`.
 */
function pgPassword(): string {
  if (process.env.E2E_PG_PASSWORD) return process.env.E2E_PG_PASSWORD;

  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const raw of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const line = raw.trim();
      const idx = line.indexOf("=");
      if (idx > 0 && line.slice(0, idx).trim() === "E2E_PG_PASSWORD") {
        return line.slice(idx + 1).trim();
      }
    }
  }

  throw new Error(
    "Falta E2E_PG_PASSWORD. Defínela en poi-erp/.env.local para poder correr los e2e.",
  );
}

const db = () =>
  new Client({
    host: "db.ctlvfkiwpmyljeofgitz.supabase.co",
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: pgPassword(),
    ssl: { rejectUnauthorized: false },
  });

test.describe("Promociones CRUD", () => {
  test.describe.configure({ mode: "serial" });

  let categoryId: string;

  // Seed a test category so the form can advance past Step 3
  test.beforeAll(async () => {
    const client = db();
    await client.connect();
    const tenantRes = await client.query("SELECT id FROM tenants LIMIT 1");
    const tenantId = tenantRes.rows[0].id;
    const res = await client.query(
      "INSERT INTO product_categories (tenant_id, name, type) VALUES ($1, 'Categoria E2E Test', 'product') RETURNING id",
      [tenantId]
    );
    categoryId = res.rows[0].id;
    await client.end();
  });

  // Cleanup test category and any leftover test promotions
  test.afterAll(async () => {
    const client = db();
    await client.connect();
    if (categoryId) {
      await client.query("DELETE FROM product_categories WHERE id = $1", [categoryId]);
    }
    await client.query("DELETE FROM promotions WHERE code = $1", [PROMO_CODE]);
    await client.end();
  });

  test("01 - Crear promoción de porcentaje", async ({ page }) => {
    await page.goto("/inventario/promociones");
    await expect(page.getByRole("heading", { name: "Promociones" })).toBeVisible();

    // Click "Nueva promocion"
    await page.getByRole("button", { name: "Nueva promocion" }).click();
    await expect(page).toHaveURL(/\/inventario\/promociones\/nueva/);

    // Step 1: Datos básicos
    await page.getByRole("textbox", { name: /codigo/i }).fill(PROMO_CODE);
    await page.getByRole("textbox", { name: /nombre/i }).fill(PROMO_NAME);
    await page.getByPlaceholder("Ej:").fill("10");

    // Advance to step 2
    const nextBtn = page.getByRole("button", { name: "Siguiente" });
    await expect(nextBtn).toBeEnabled({ timeout: 3000 });
    await nextBtn.click();

    // Step 2: Requisitos y sede — click the Radix checkbox button
    await page.getByRole("checkbox", { name: /sede/i }).first().click();

    await expect(nextBtn).toBeEnabled({ timeout: 3000 });
    await nextBtn.click();

    // Step 3: Categorías y etiquetas — select the test category
    await page.waitForTimeout(500);
    await page.getByRole("checkbox", { name: /categoria e2e/i }).first().click();
    await expect(nextBtn).toBeEnabled({ timeout: 3000 });
    await nextBtn.click();

    // Step 4: Tiempo — leave empty (permanente)
    await page.waitForTimeout(500);
    await expect(nextBtn).toBeEnabled({ timeout: 3000 });
    await nextBtn.click();

    // Step 5: Confirmación — verify summary and save
    await page.waitForTimeout(500);
    await expect(page.getByText(PROMO_CODE)).toBeVisible();
    await expect(page.getByText(PROMO_NAME)).toBeVisible();

    const saveBtn = page.getByRole("button", { name: /guardar|crear/i });
    await expect(saveBtn).toBeEnabled({ timeout: 3000 });
    await saveBtn.click();

    // Verify redirect to list and promotion appears
    await expect(page).toHaveURL(/\/inventario\/promociones$/, { timeout: 15000 });
    await expect(page.getByText(PROMO_CODE)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(PROMO_NAME)).toBeVisible();
  });

  test("02 - Editar promoción", async ({ page }) => {
    await page.goto("/inventario/promociones");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(PROMO_CODE)).toBeVisible({ timeout: 10000 });

    // Open actions menu for the promotion row
    const row = page.locator("tr", { hasText: PROMO_CODE });
    await row.getByRole("button").last().click();

    // Click "Editar" in dropdown
    await page.getByRole("menuitem", { name: /editar/i }).click();
    await expect(page).toHaveURL(/\/inventario\/promociones\/.*\/editar/, { timeout: 5000 });

    // Step 1: Change name and value
    const nameInput = page.getByRole("textbox", { name: /nombre/i });
    await nameInput.clear();
    await nameInput.fill(PROMO_NAME_EDITED);

    const valueInput = page.getByPlaceholder("Ej:");
    await valueInput.clear();
    await valueInput.fill("15");

    // Navigate through all steps to confirmation
    const nextBtn = page.getByRole("button", { name: "Siguiente" });

    for (let i = 0; i < 4; i++) {
      await expect(nextBtn).toBeEnabled({ timeout: 3000 });
      await nextBtn.click();
      await page.waitForTimeout(400);
    }

    // Verify updated values in summary
    await expect(page.getByText(PROMO_NAME_EDITED)).toBeVisible();

    // Save
    const saveBtn = page.getByRole("button", { name: /guardar|actualizar/i });
    await expect(saveBtn).toBeEnabled({ timeout: 3000 });
    await saveBtn.click();

    // Verify redirect and updated data
    await expect(page).toHaveURL(/\/inventario\/promociones$/, { timeout: 15000 });
    await expect(page.getByText(PROMO_NAME_EDITED)).toBeVisible({ timeout: 5000 });
  });

  test("03 - Ver detalle de promoción", async ({ page }) => {
    await page.goto("/inventario/promociones");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(PROMO_CODE)).toBeVisible({ timeout: 10000 });

    // Open actions menu
    const row = page.locator("tr", { hasText: PROMO_CODE });
    await row.getByRole("button").last().click();

    // Click "Ver detalle"
    await page.getByRole("menuitem", { name: /ver detalle/i }).click();
    await expect(page).toHaveURL(/\/inventario\/promociones\/[^/]+$/, { timeout: 5000 });

    // Verify detail page shows correct data
    await expect(page.getByText(PROMO_NAME_EDITED)).toBeVisible();
    await expect(page.getByText("15%", { exact: true })).toBeVisible();
    await expect(page.getByText(/activa/i)).toBeVisible();
  });

  test("04 - Eliminar promoción", async ({ page }) => {
    await page.goto("/inventario/promociones");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(PROMO_CODE)).toBeVisible({ timeout: 10000 });

    // Open actions menu
    const row = page.locator("tr", { hasText: PROMO_CODE });
    await row.getByRole("button").last().click();

    // Click "Eliminar"
    await page.getByRole("menuitem", { name: /eliminar/i }).click();

    // Confirm deletion in dialog
    const confirmBtn = page.getByRole("button", { name: /eliminar|confirmar/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });
    await confirmBtn.click();

    // Verify promotion is gone
    await page.waitForTimeout(2000);
    await expect(page.getByText(PROMO_CODE)).not.toBeVisible({ timeout: 5000 });
  });
});
