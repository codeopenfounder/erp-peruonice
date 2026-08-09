/**
 * Reglas de reintento y de plazo legal de envío a SUNAT.
 *
 * Módulo **puro y sin dependencias** a propósito: lo importan tanto el servidor
 * (`autoRetrySunat`, las server actions) como componentes cliente (las columnas
 * de la tabla de comprobantes). Esa es la razón de que `MAX_SUNAT_ATTEMPTS` viva
 * aquí y no en `persist.ts`: `persist` arrastra el cliente admin de Supabase, así
 * que un componente cliente no puede importarlo, y el número acabó duplicado a
 * mano en `components/ventas/invoice-columns.tsx`.
 */

// ---------------------------------------------------------------------------
// Reintentos
// ---------------------------------------------------------------------------

/**
 * Tope de envíos automáticos por comprobante.
 *
 * Al alcanzarlo, `autoRetrySunat` deja de verlo: es el dead-letter, y sólo se
 * sale de ahí con el botón «Reintentar SUNAT», que resetea el contador porque un
 * reintento manual es una decisión humana.
 */
export const MAX_SUNAT_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Fallos de autenticación del emisor ante SUNAT
// ---------------------------------------------------------------------------

/**
 * Códigos SOAP de SUNAT que NO hablan del comprobante, sino de las credenciales
 * del emisor: el usuario SOL con el que el proveedor envía en su nombre.
 *
 * Importa distinguirlos porque su tratamiento es el contrario del habitual. Un
 * rechazo de contenido se corrige en el documento y se reenvía; uno de estos no
 * se arregla reintentando —fallará idéntico las cinco veces— y además afecta a
 * TODOS los comprobantes a la vez, no a uno. Lo que hay que tocar está en el
 * panel del proveedor, no en el ERP.
 *
 * Visto en producción el 2026-08-09: Billme firmó la boleta B001-00000307 con el
 * certificado correcto de la empresa (emitido por RENIEC, vigente) y SUNAT
 * respondió `a:Client.0103`. El documento estaba bien; el usuario SOL registrado
 * en el proveedor no existía.
 */
export const SUNAT_AUTH_FAULTS: Record<string, string> = {
  "0101": "El encabezado de seguridad es incorrecto",
  "0102": "Usuario o contraseña incorrectos",
  "0103": "El usuario SOL ingresado no existe",
  "0104": "La clave SOL ingresada es incorrecta",
  "0105": "El usuario SOL no está activo",
  "0106": "El usuario SOL no es válido",
  "0110": "El usuario SOL existe pero no tiene asignado el perfil de facturación electrónica",
  "0111": "El usuario SOL no tiene el perfil para enviar comprobantes electrónicos",
  "0112": "El usuario debe ser secundario, no el principal del RUC",
  "0113": "El usuario SOL no está afiliado a Facturación Electrónica",
};

/**
 * Qué hay que tocar para resolver un fallo de credenciales. Es lo primero que
 * pregunta quien se lo encuentra, y la respuesta no está en el ERP.
 */
export const SUNAT_AUTH_FAULT_REMEDY: Record<string, string> = {
  "0101": "Revisa el token y las credenciales de la empresa en el panel del proveedor.",
  "0102": "Revisa el Usuario SOL y la Clave SOL en el panel del proveedor.",
  "0103":
    "Crea el usuario secundario en SUNAT (Empresas › Usuarios Secundarios) y ponlo " +
    "en el panel del proveedor. Va sin el RUC delante: el proveedor lo antepone.",
  "0104":
    "La Clave SOL del panel del proveedor no coincide con la de SUNAT. Reescríbela a " +
    "mano; si el usuario es nuevo, estrénala antes entrando una vez al portal.",
  "0105": "Activa el usuario secundario en SUNAT.",
  "0106": "El usuario no sirve para emisión electrónica: crea uno secundario nuevo.",
  "0110":
    "En SUNAT, al usuario secundario: Asignar perfiles › TRIBUTARIOS › Comprobantes de " +
    "pago › SEE - Del Contribuyente y Envío de Documentos › marcar «Servicio de Envío " +
    "de Documentos Electrónicos», «Certificado Digital» y «Consultar Envíos de CPE».",
  "0111": "Falta el perfil de envío de comprobantes en el usuario secundario de SUNAT.",
  "0112": "El panel del proveedor tiene el usuario principal: pon un usuario secundario.",
  "0113": "Afilia el RUC al SEE – Del Contribuyente desde el portal de SUNAT.",
};

/**
 * Fallos que **no son culpa del comprobante**: o la configuración del emisor, o el
 * servicio de SUNAT.
 *
 * La distinción tiene una consecuencia práctica: un rechazo de contenido se corrige
 * en el documento, mientras que estos se arreglan una vez y **desbloquean todos los
 * comprobantes a la vez**. Por eso no consumen el presupuesto de reintentos del
 * documento (ver `autoRetrySunat`): si lo consumieran, una configuración mal puesta
 * durante una tarde enterraría en el dead-letter toda la facturación del día, y
 * habría que rescatarla a mano comprobante por comprobante.
 *
 * Los códigos de sistema (`0100`, `0109`, `0130`, `0131`) son caídas temporales de
 * SUNAT. `0140` es el bloqueo por documento duplicado en proceso, que se resuelve
 * solo en unos minutos.
 */
export const SUNAT_SYSTEMIC_FAULTS: readonly string[] = [
  ...Object.keys(SUNAT_AUTH_FAULTS),
  "0100", // El sistema no puede responder su solicitud
  "0109", // El servicio de autenticación no está disponible
  "0130", // No se pudo obtener el ticket de proceso
  "0131", // No se pudo grabar el archivo en el directorio
  "0140", // Existe un documento igual en proceso
];

export function isSystemicSunatFault(code: string | null | undefined): boolean {
  const bare = extractSunatCode(code);
  return bare !== null && SUNAT_SYSTEMIC_FAULTS.includes(bare);
}

/**
 * Extrae el código numérico de SUNAT de la envoltura SOAP del proveedor.
 *
 * Billme no usa un único separador y esto ya costó un fallo: `EnviarBoletaFactura`
 * devuelve `a:Client.0103` —punto— mientras que `ConsultarCdr` devuelve
 * `ns0:0103` —dos puntos—. Partir por el punto reconocía el primero y no el
 * segundo, así que la sonda de credenciales daba verde justo en el caso que
 * venía a detectar. Se busca el número final, que es lo único estable.
 */
export function extractSunatCode(code: string | null | undefined): string | null {
  const digits = code?.match(/(\d{3,4})\s*$/)?.[1];
  return digits ? digits.padStart(4, "0") : null;
}

/** ¿El rechazo es de credenciales del emisor y no del comprobante? */
export function isProviderAuthFault(code: string | null | undefined): boolean {
  const bare = extractSunatCode(code);
  return bare !== null && bare in SUNAT_AUTH_FAULTS;
}

// ---------------------------------------------------------------------------
// Plazo legal de envío
// ---------------------------------------------------------------------------

/**
 * Plazo máximo de envío, en días calendario contados **a partir del día
 * siguiente** a la fecha de emisión.
 *
 * - **Factura y sus notas: 3 días.** RS 000193-2020/SUNAT art. 3, con el plazo
 *   que fijó la RS 000003-2023/SUNAT, vigente desde el 1 de enero de 2023 (venía
 *   de 7 días; la RS 000042-2021 había suspendido el de 1 día).
 * - **Boleta y sus notas: 7 días.** RS 097-2012/SUNAT art. 12 y RS 000193-2020
 *   art. 4: el resumen diario —o el ejemplar remitido individualmente— se envía
 *   como máximo hasta el sétimo día calendario siguiente a la emisión.
 *
 * Pasado el plazo, el comprobante **pierde la calidad de comprobante de pago**
 * aunque se haya entregado al cliente, y SUNAT lo rechaza con los códigos 2600
 * ("El comprobante fue enviado fuera del plazo permitido") o 2329 ("La fecha de
 * emisión se encuentra fuera del límite permitido").
 */
export const SUNAT_DEADLINE_DAYS = { factura: 3, boleta: 7 } as const;

/**
 * ¿Qué plazo le toca a este comprobante?
 *
 * Se decide por el **primer carácter de la serie**, no por `document_type`, y no
 * es un atajo: el Anexo N.º 3 de la RS 097-2012 (sustituido por la RS 114-2019)
 * obliga a que la serie empiece por `F` en lo que factura o modifica facturas y
 * por `B` en boletas y sus notas — lo valida `lib/validators/fact-config.ts` y
 * SUNAT lo rechaza con 2345. Así una `FC01` (NC de factura) hereda los 3 días de
 * la factura y una `BC01` los 7 de la boleta, que es lo que dice la norma;
 * mirando `document_type` las dos serían "nota_credito" y compartirían plazo.
 */
export function deadlineDaysFor(seriesCode: string | null | undefined): number {
  return seriesCode?.trim().toUpperCase().startsWith("F")
    ? SUNAT_DEADLINE_DAYS.factura
    : SUNAT_DEADLINE_DAYS.boleta;
}

/**
 * Último día en que el comprobante puede enviarse, `YYYY-MM-DD` en hora de Perú.
 *
 * `issueDate` acepta tanto `YYYY-MM-DD` (columna `issue_date`) como un ISO
 * completo (`created_at`); en el segundo caso se convierte a la fecha civil
 * peruana antes de contar, porque un comprobante emitido a las 20:00 de Lima ya
 * es del día siguiente en UTC y contaría un día de menos.
 */
export function sunatDeadlineDate(
  issueDate: string,
  seriesCode: string | null | undefined,
): string {
  const civil = toPeruDate(issueDate);
  const [y, m, d] = civil.split("-").map(Number);
  // UTC a propósito: aritmética de fechas civiles, sin husos ni horario de verano.
  const limit = new Date(Date.UTC(y, m - 1, d));
  limit.setUTCDate(limit.getUTCDate() + deadlineDaysFor(seriesCode));
  return limit.toISOString().slice(0, 10);
}

/**
 * Días que quedan de plazo. 0 = hoy es el último día; negativo = caducado.
 * `null` cuando el comprobante ya no necesita enviarse.
 */
export function daysLeftToSend(
  issueDate: string,
  seriesCode: string | null | undefined,
  status: string,
  today: string = todayPeru(),
): number | null {
  if (status === "accepted" || status === "voided") return null;
  return daysBetween(today, sunatDeadlineDate(issueDate, seriesCode));
}

/**
 * ¿Sigue dentro de plazo?
 *
 * Es la pregunta que tienen que hacerse el auto-retry y el botón de reenvío
 * **antes** de gastar un intento: fuera de plazo, todo envío es un rechazo
 * garantizado, y el reintento sólo sirve para enterrar el comprobante bajo un
 * contador agotado en vez de decir lo que pasa.
 */
export function isWithinSunatDeadline(
  issueDate: string,
  seriesCode: string | null | undefined,
  today: string = todayPeru(),
): boolean {
  return daysBetween(today, sunatDeadlineDate(issueDate, seriesCode)) >= 0;
}

// ---------------------------------------------------------------------------
// Utilidades de fecha civil (sin dependencias: este módulo lo carga el navegador)
// ---------------------------------------------------------------------------

const PERU_TZ = "America/Lima";

export function todayPeru(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: PERU_TZ });
}

/** `YYYY-MM-DD` tal cual; cualquier otra cosa se interpreta y se pasa a hora de Perú. */
function toPeruDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(value).toLocaleDateString("en-CA", { timeZone: PERU_TZ });
}

function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
