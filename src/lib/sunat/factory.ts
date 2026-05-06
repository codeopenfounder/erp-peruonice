/**
 * Factory para resolver el SunatProvider correcto según la configuración del tenant.
 */

import { ApiSunatAdapter } from "./providers/apisunat-adapter";
import { BilmeAdapter } from "./providers/bilme-adapter";
import type { SunatProvider } from "./types";

const apisunatInstance = new ApiSunatAdapter();
const bilmeInstance = new BilmeAdapter();

export function getSunatProvider(
  provider: string | null | undefined,
): SunatProvider {
  const key = (provider || "apisunat").toLowerCase();
  switch (key) {
    case "apisunat":
      return apisunatInstance;
    case "bilme":
      return bilmeInstance;
    default:
      throw new Error(`Proveedor SUNAT no soportado: ${provider}`);
  }
}

export const SUPPORTED_PROVIDERS = ["apisunat", "bilme"] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];
