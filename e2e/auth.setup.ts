import { test as setup, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const AUTH_FILE = "e2e/.auth/user.json";

/**
 * Credenciales de la sesión de pruebas — NUNCA literales en el código.
 *
 * Estaban escritas a mano aquí, y este repositorio es **público**. Que ya no estén
 * no las descompromete: el historial las conserva. Hay que rotarlas — ver el
 * runbook en `docs/pendiente-notas-y-multipos.md`.
 */
function fromEnvLocal(name: string): string {
  if (process.env[name]) return process.env[name] as string;

  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const raw of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx > 0 && line.slice(0, idx).trim() === name) {
        return line.slice(idx + 1).trim();
      }
    }
  }

  throw new Error(
    `Falta ${name}. Defínela en poi-erp/.env.local para poder correr los e2e.`,
  );
}

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/correo|email/i).fill(fromEnvLocal("E2E_TEST_EMAIL"));
  await page.getByLabel(/contraseña|password/i).fill(fromEnvLocal("E2E_TEST_PASSWORD"));
  await page.getByRole("button", { name: /iniciar|ingresar|login/i }).click();

  // Wait for redirect to dashboard (authenticated state)
  await page.waitForURL(/\/(dashboard|ventas|inventario)/, { timeout: 15000 });
  await expect(page).not.toHaveURL(/login/);

  // Save storage state for reuse
  await page.context().storageState({ path: AUTH_FILE });
});
