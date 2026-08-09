/**
 * Validación del RUC peruano: longitud, prefijo y dígito verificador módulo 11.
 *
 * Historia de este fichero
 * -----------------------
 * El algoritmo estaba implementado —correctamente— en
 * `kronos-fact/src/lib/invoicing/ruc-validator.ts`, y **no lo llamaba nadie**.
 * `CLAUDE.md` afirmaba que el proyecto validaba el RUC; era falso. Los únicos
 * `checkDigit` vivos del repositorio son de códigos de barras EAN.
 *
 * Se trae al ERP porque es donde importa: el ERP es el único punto de escritura de
 * `fact_config.ruc` y el único que construye el payload que va al proveedor.
 *
 * Por qué importa de verdad
 * ------------------------
 * Verificado contra la API de Billme en desarrollo: **aceptó una boleta con un RUC
 * ajeno**. O sea que el proveedor no protege de esto. Un RUC mal formado pasa
 * silenciosamente en homologación y aparece como rechazo en producción, con un
 * correlativo ya consumido y un hueco en la serie.
 *
 * Contrastado con RUCs reales: el de POI (20613509446), el de los ejemplos de la
 * documentación de Billme (20607599727) y uno público conocido (20100070970) pasan;
 * alterar el último dígito o el prefijo los rechaza.
 */

/** Prefijos válidos de RUC: 10 persona natural, 15/17 casos especiales, 20 jurídica. */
const VALID_PREFIXES = new Set(["10", "15", "17", "20"]);

/** Pesos del módulo 11 que publica SUNAT. */
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function isValidRuc(ruc: string | null | undefined): boolean {
  if (!ruc || !/^\d{11}$/.test(ruc)) return false;
  if (!VALID_PREFIXES.has(ruc.slice(0, 2))) return false;

  const digits = ruc.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += digits[i] * WEIGHTS[i];

  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;

  return checkDigit === digits[10];
}

/**
 * El emisor es siempre una empresa, así que su RUC empieza por 20 (o 15/17 en
 * casos especiales). Un emisor con prefijo 10 sería una persona natural con
 * negocio, que también puede emitir: no se restringe el prefijo más allá de lo
 * que admite `isValidRuc`.
 */
export function isEmisorRucValid(ruc: string | null | undefined): boolean {
  return isValidRuc(ruc);
}

/** Mensaje único, para que el formulario y la emisión digan lo mismo. */
export const RUC_INVALID_MESSAGE =
  "El RUC no es válido: revisa los 11 dígitos y el dígito verificador.";
