import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/correo|email/i).fill("administracion@peruonice.com");
  await page.getByLabel(/contraseña|password/i).fill("peruonice2026$");
  await page.getByRole("button", { name: /iniciar|ingresar|login/i }).click();

  // Wait for redirect to dashboard (authenticated state)
  await page.waitForURL(/\/(dashboard|ventas|inventario)/, { timeout: 15000 });
  await expect(page).not.toHaveURL(/login/);

  // Save storage state for reuse
  await page.context().storageState({ path: AUTH_FILE });
});
