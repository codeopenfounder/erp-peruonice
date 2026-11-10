/**
 * Contrato CORS entre el ERP y POI Fact (POS de escritorio, Tauri/WebView2).
 *
 * El POS llama a /api/fact/* desde otro origen, así que cada cabecera que no es
 * "CORS-safelisted" dispara un preflight y tiene que figurar en
 * Access-Control-Allow-Headers. Si falta una, WebView2 bloquea la petición antes
 * de enviarla y el POS solo ve "TypeError: Failed to fetch" ("Error sync").
 *
 * Pasó con X-POI-Device-Id: el POS la manda desde la v1.0.3 en todas las
 * peticiones autenticadas (pull, push, heartbeat, validate-pin) y el ERP nunca la
 * declaró. El login con PIN no la lleva, por eso entrar funcionaba y sincronizar no.
 *
 * Al añadir una cabecera nueva en el POS, añádela aquí y en next.config.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config.ts";

// Cabeceras que POI Fact envía a /api/fact/* (poi-fact/src/api/sync-engine.ts, fetchWithAuth).
const POS_REQUEST_HEADERS = ["Content-Type", "Authorization", "X-POI-Device-Id"];

test("CORS de /api/fact permite todas las cabeceras que envía el POS", async () => {
  const rules = await nextConfig.headers();
  const fact = rules.find((r) => r.source === "/api/fact/:path*");
  assert.ok(fact, "falta la regla de cabeceras para /api/fact/:path*");

  const allow = fact.headers.find(
    (h) => h.key.toLowerCase() === "access-control-allow-headers",
  );
  assert.ok(allow, "falta Access-Control-Allow-Headers en /api/fact/:path*");

  const allowed = allow.value.split(",").map((s) => s.trim().toLowerCase());
  for (const header of POS_REQUEST_HEADERS) {
    assert.ok(
      allowed.includes(header.toLowerCase()),
      `${header} no está en Access-Control-Allow-Headers de /api/fact`,
    );
  }
});
