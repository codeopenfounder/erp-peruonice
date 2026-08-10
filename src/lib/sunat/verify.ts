/**
 * Verificación del token del proveedor SUNAT y detección de su ambiente.
 *
 * Por qué existe: con apisunat el ambiente era visible en la configuración
 * (URL de sandbox vs producción). Con Bilme lo decide EL TOKEN — la empresa se
 * registra en su panel como "Desarrollo" o "Producción" y cada una emite el
 * suyo—, así que un token de desarrollo guardado con "Modo Producción" activo
 * respondería éxito en todo, los comprobantes irían a homologación de SUNAT y
 * se repartirían boletas sin validez fiscal con apariencia de normalidad.
 * Este sistema ya sufrió el fallo gemelo con apisunat (is_production=true
 * apuntando a sandbox, facturación caída sin que nadie lo notara).
 *
 * Bilme no publica un endpoint de verificación, pero ConsultarCdr sirve: es una
 * consulta que no emite nada y sus respuestas distinguen los tres casos.
 * Verificado contra la API real.
 */

import {
  SUNAT_AUTH_FAULTS,
  SUNAT_AUTH_FAULT_REMEDY,
  extractSunatCode,
  isProviderAuthFault,
} from "./policy";

export type SunatEnvironment = "development" | "production";

export interface TokenVerification {
  valid: boolean;
  environment: SunatEnvironment | null;
  message: string;
  /**
   * Problema con las credenciales SOL del emisor registradas en el proveedor.
   *
   * Es independiente del token: el token puede ser perfectamente válido y aun así
   * no poderse emitir nada, porque quien rechaza es SUNAT y lo que rechaza es el
   * usuario SOL con el que el proveedor envía en nombre de la empresa.
   *
   * Existe porque esta función daba verde en ese caso. `ConsultarCdr` responde
   * HTTP 400 con `faultCode` tanto cuando el comprobante consultado no existe
   * —lo esperado, porque se consulta uno inventado— como cuando SUNAT no
   * reconoce al usuario, y sólo se miraba el código HTTP. Comprobado en
   * producción el 2026-08-09: el botón decía "Token válido, de una empresa de
   * PRODUCCIÓN" mientras SUNAT devolvía `0103` y ninguna boleta podía emitirse.
   */
  solWarning?: string;
}

const BILME_BASE = "https://www.api.billmeperu.com/api/v1";
const VERIFY_TIMEOUT_MS = 15_000;

/**
 * Respuestas observadas de ConsultarCdr:
 *   404 "El token no es válido"                                   -> token inválido
 *   401 "sólo está disponible para empresas de producción"        -> token de DESARROLLO
 *   200 / 400 con faultCode del comprobante consultado            -> token de PRODUCCIÓN
 */
export async function verifyBilmeToken(
  token: string,
  ruc: string,
): Promise<TokenVerification> {
  if (!token.trim()) {
    return { valid: false, environment: null, message: "Ingresa un token para verificarlo." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const res = await fetch(`${BILME_BASE}/Emission/ConsultarCdr`, {
      method: "POST",
      headers: {
        token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      // Un comprobante que con toda probabilidad no existe: solo interesa el
      // modo de fallo, no el resultado.
      body: JSON.stringify({
        numDocEmisor: ruc,
        tipoComprobante: "01",
        serie: "F001",
        correlativo: "99999999",
      }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => null)) as {
      message?: string;
      data?: { faultCode?: string; faultDescription?: string } | null;
    } | null;
    const message = body?.message ?? "";
    const faultCode = body?.data?.faultCode ?? "";

    if (res.status === 404) {
      return {
        valid: false,
        environment: null,
        message: "El token no es válido. Cópialo de nuevo desde el panel de Bilme.",
      };
    }

    if (res.status === 401 && /producci[oó]n/i.test(message)) {
      return {
        valid: true,
        environment: "development",
        message:
          "Token válido, de una empresa de DESARROLLO. Los comprobantes se emiten contra el ambiente de pruebas de SUNAT y no tienen validez fiscal.",
      };
    }

    if (res.status === 401) {
      return { valid: false, environment: null, message: message || "Token no autorizado." };
    }

    // El token sirve —Billme lo aceptó y llegó a hablar con SUNAT—, pero SUNAT
    // puede estar rechazando al emisor. Ese fallo no se ve emitiendo un
    // comprobante de prueba: se ve aquí, sin emitir nada.
    if (isProviderAuthFault(faultCode)) {
      const bare = extractSunatCode(faultCode)!;
      return {
        valid: true,
        environment: "production",
        message:
          "Token válido, de una empresa de PRODUCCIÓN. Los comprobantes se emiten con validez fiscal ante SUNAT.",
        // El remedio sale de la tabla por código, no de un texto genérico: cada
        // uno de estos fallos se arregla en un sitio distinto, y decir "revisa
        // las credenciales" manda a buscar por todos ellos.
        solWarning:
          `Pero SUNAT rechaza las credenciales del emisor (${bare}: ` +
          `${SUNAT_AUTH_FAULTS[bare]}). Con esto NO se puede emitir nada, por muy ` +
          `correcto que sea el comprobante. ${SUNAT_AUTH_FAULT_REMEDY[bare] ?? ""}`.trim(),
      };
    }

    return {
      valid: true,
      environment: "production",
      message: "Token válido, de una empresa de PRODUCCIÓN. Los comprobantes se emiten con validez fiscal ante SUNAT.",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { valid: false, environment: null, message: "Bilme no respondió a tiempo. Inténtalo de nuevo." };
    }
    return {
      valid: false,
      environment: null,
      message: err instanceof Error ? err.message : "No se pudo contactar con Bilme.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyProviderToken(
  provider: string,
  token: string,
  ruc: string,
): Promise<TokenVerification> {
  if (provider === "bilme") return verifyBilmeToken(token, ruc);
  return {
    valid: true,
    environment: null,
    message: "Este proveedor no ofrece verificación de token; se comprobará al emitir.",
  };
}
