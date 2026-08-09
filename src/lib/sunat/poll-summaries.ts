/**
 * Cierre del ciclo asíncrono de los resúmenes SUNAT (RC/RA).
 *
 * El problema que resuelve
 * ------------------------
 * `EnviarResumen` no responde con una aceptación: responde con un **ticket**. La
 * validación real ocurre después, y se consulta con `ConsultarEstadoTicket`.
 * Hasta ahora nadie lo consultaba: `sunat_summaries.status` se quedaba en
 * `pending` para siempre y el comprobante se marcaba `voided` con un simple acuse
 * de recepción. Es decir, el sistema afirmaba que un comprobante estaba anulado
 * ante SUNAT sin tener ni una prueba de que lo estuviera.
 *
 * Ahora la baja pasa por dos estados: el comprobante queda en `pending_void`
 * cuando el resumen se envía, y sólo llega a `voided` cuando el ticket vuelve
 * aceptado. Si vuelve rechazado, regresa a `accepted`.
 *
 * El reloj
 * --------
 * No hay cron en Vercel (`vercel.json` sólo fija la región). El único disparador
 * periódico del sistema es el pull del POS, cada 2 minutos, así que esto se llama
 * desde ahí igual que `autoRetrySunat`, más un botón manual en el ERP. Con el POS
 * apagado no se consulta nada, y eso es aceptable: la baja ya está enviada y el
 * plazo de SUNAT es de días.
 *
 * La asimetría que hay que conocer
 * --------------------------------
 * La devolución de stock y el movimiento de caja se hacen **cuando se envía el
 * RA**, no cuando el ticket vuelve aceptado. Es deliberado: la mercadería volvió
 * físicamente al almacén y el dinero salió del cajón en ese momento. Si SUNAT
 * rechaza el resumen, deshacer la devolución falsearía el inventario real, así
 * que en su lugar se avisa por notificación para que alguien decida. El
 * comprobante vuelve a `accepted` y se puede reintentar la baja.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getSunatProvider } from "./factory";
import type { FactConfig, SunatSummaryRef, SunatSummaryType } from "./types";

/**
 * Tope de consultas antes de rendirse. A un pull cada 2 minutos son ~40 minutos.
 *
 * Sin tope, un ticket que SUNAT nunca resuelve —o el de un resumen que se registró
 * con `status: 'pending'` porque el envío falló a medias— se consultaría ~720
 * veces al día para siempre. Es el mismo agujero que `invoices.sunat_attempts`
 * cerró para las emisiones.
 */
export const MAX_TICKET_POLLS = 20;

/** Resúmenes procesados por tanda. Igual que el auto-retry: el pull no puede colgarse. */
const SUMMARIES_PER_RUN = 5;

interface PendingSummaryRow {
  id: string;
  summary_type: SunatSummaryType;
  reference_date: string;
  correlative: number;
  ticket: string;
  poll_attempts: number;
  /** Quien pidió la baja. Hace de actor de la notificación. */
  created_by: string | null;
}

export interface PollSummariesResult {
  checked: number;
  accepted: number;
  rejected: number;
  stillPending: number;
  exhausted: number;
}

const EMPTY: PollSummariesResult = {
  checked: 0,
  accepted: 0,
  rejected: 0,
  stillPending: 0,
  exhausted: 0,
};

export async function pollPendingSummaries(
  tenantId: string,
): Promise<PollSummariesResult> {
  const admin = createAdminClient();

  const { data: pending, error: listError } = await admin
    .from("sunat_summaries")
    .select("id, summary_type, reference_date, correlative, ticket, poll_attempts, created_by")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .not("ticket", "is", null)
    .lt("poll_attempts", MAX_TICKET_POLLS)
    .order("sent_at", { ascending: true })
    .limit(SUMMARIES_PER_RUN);

  if (listError) {
    console.error("[poll-summaries] No se pudieron leer los resúmenes pendientes:", listError.message);
    return EMPTY;
  }
  if (!pending?.length) return EMPTY;

  const { data: factConfigRaw } = await admin
    .from("fact_config")
    .select(
      "ruc, razon_social, direccion_fiscal, ubigeo, departamento, provincia, distrito, api_token, is_production, provider",
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .single();

  if (!factConfigRaw?.api_token) return EMPTY;

  const config: FactConfig = { ...factConfigRaw, tenant_id: tenantId };

  let provider;
  try {
    provider = getSunatProvider(config.provider);
  } catch (err) {
    console.error("[poll-summaries] Proveedor no válido:", err);
    return EMPTY;
  }

  const result = { ...EMPTY };

  for (const row of pending as PendingSummaryRow[]) {
    result.checked++;
    try {
      // Se cuenta el intento ANTES de la llamada. Si la llamada revienta o cuelga,
      // el contador ya subió: es la única forma de que un ticket que siempre falla
      // acabe rindiéndose en vez de reintentarse eternamente.
      const { data: attemptsRaw } = await admin.rpc("fn_increment_summary_polls", {
        p_summary_id: row.id,
      });
      const attempts = typeof attemptsRaw === "number" ? attemptsRaw : row.poll_attempts + 1;

      const ref: SunatSummaryRef = {
        correlative: row.correlative,
        referenceDate: row.reference_date,
      };

      const ticketResult = await provider.checkTicket(
        config,
        row.summary_type,
        ref,
        row.ticket,
      );

      const summaryLabel = `${row.summary_type}-${row.reference_date.replace(/-/g, "")}-${row.correlative}`;

      if (ticketResult.status === "pending") {
        if (attempts >= MAX_TICKET_POLLS) {
          result.exhausted++;
          await markSummary(admin, row.id, "failed", {
            response_code: ticketResult.responseCode,
            response_desc:
              `SUNAT no resolvió el ticket tras ${attempts} consultas. ` +
              `Última respuesta: ${ticketResult.responseDesc ?? "sin detalle"}. ` +
              `El comprobante sigue en "anulación pendiente": consulta el estado en el portal de SUNAT.`,
          });
          console.error(
            `[poll-summaries] ${summaryLabel}: ticket sin resolver tras ${attempts} consultas`,
          );
          await notifySummaryProblem(
            tenantId,
            row.created_by,
            "Anulación sin respuesta de SUNAT",
            `El resumen ${summaryLabel} no obtuvo respuesta de SUNAT tras ${attempts} consultas. El comprobante sigue en «anulación pendiente».`,
          );
        } else {
          result.stillPending++;
        }
        continue;
      }

      const accepted = ticketResult.status === "accepted";
      if (accepted) result.accepted++;
      else result.rejected++;

      await markSummary(admin, row.id, accepted ? "accepted" : "rejected", {
        response_code: ticketResult.responseCode,
        response_desc: ticketResult.responseDesc,
        xml_url: ticketResult.xmlUrl,
        cdr_url: ticketResult.cdrUrl,
      });

      // Comprobantes que informa este resumen. Sin `sunat_summary_items`
      // (migración 00041) esto era imposible de resolver: el resumen y el
      // comprobante eran dos hechos sin relación.
      const { data: items, error: itemsError } = await admin
        .from("sunat_summary_items")
        .select("invoice_id")
        .eq("summary_id", row.id);

      if (itemsError) {
        console.error(
          `[poll-summaries] ${summaryLabel}: no se pudieron leer los comprobantes del resumen:`,
          itemsError.message,
        );
        continue;
      }

      const invoiceIds = (items ?? []).map((i) => i.invoice_id as string);
      if (invoiceIds.length === 0) {
        console.warn(
          `[poll-summaries] ${summaryLabel}: resumen resuelto (${ticketResult.status}) sin comprobantes enlazados. ` +
            `Es un resumen anterior a la migración 00041.`,
        );
        continue;
      }

      // El filtro por `pending_void` es deliberado: si un humano ya movió el
      // comprobante a mano, el polling no lo pisa.
      const { error: invError } = await admin
        .from("invoices")
        .update({
          status: accepted ? "voided" : "accepted",
          sunat_ticket_status: accepted ? "completed" : "failed",
        })
        .in("id", invoiceIds)
        .eq("status", "pending_void");

      if (invError) {
        console.error(
          `[poll-summaries] ${summaryLabel}: no se pudo actualizar el estado de los comprobantes:`,
          invError.message,
        );
        continue;
      }

      if (!accepted) {
        // El stock y la caja NO se revierten: ver la cabecera del módulo.
        console.error(
          `[poll-summaries] ${summaryLabel}: SUNAT RECHAZÓ la baja (${ticketResult.responseCode ?? "sin código"}): ${ticketResult.responseDesc ?? "sin detalle"}`,
        );
        await notifySummaryProblem(
          tenantId,
          row.created_by,
          "SUNAT rechazó una anulación",
          `El resumen ${summaryLabel} fue rechazado: ${ticketResult.responseDesc ?? "sin detalle"}. ` +
            `El comprobante volvió a «aceptado», pero el stock y la devolución de caja YA se registraron cuando se envió la baja: revísalos.`,
        );
      }
    } catch (err) {
      // Nunca se propaga: esto corre fire-and-forget desde el pull del POS y una
      // excepción aquí no puede tumbar una sincronización.
      console.error(`[poll-summaries] Fallo consultando el resumen ${row.id}:`, err);
    }
  }

  return result;
}

async function markSummary(
  admin: ReturnType<typeof createAdminClient>,
  summaryId: string,
  status: "accepted" | "rejected" | "failed",
  patch: {
    response_code?: string | null;
    response_desc?: string | null;
    xml_url?: string | null;
    cdr_url?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (patch.response_code !== undefined) update.response_code = patch.response_code;
  if (patch.response_desc !== undefined) update.response_desc = patch.response_desc;
  // Igual que en `persistSunatResult`: sólo se escriben si vienen con valor, para
  // no borrar con null un XML o CDR bueno de una consulta anterior.
  if (patch.xml_url) update.xml_url = patch.xml_url;
  if (patch.cdr_url) update.cdr_url = patch.cdr_url;

  const { error } = await admin
    .from("sunat_summaries")
    .update(update)
    .eq("id", summaryId);

  if (error) {
    console.error(
      `[poll-summaries] No se pudo persistir el estado del resumen ${summaryId}: ${error.message}`,
    );
  }
}

/**
 * Notificación al módulo de comprobantes. Import dinámico y try/catch porque
 * `notifyModuleAction` es una server action y esto corre dentro de una API route
 * llamada por el POS: mismo patrón que la notificación de sobreventa del push.
 *
 * `actorId` tiene que ser un usuario real —la función lo añade a la lista de
 * destinatarios y `notifications.user_id` apunta a `auth.users`—, así que cuando
 * el resumen no tiene `created_by` (los anteriores a 00039) sólo queda el log.
 */
async function notifySummaryProblem(
  tenantId: string,
  actorId: string | null,
  title: string,
  message: string,
): Promise<void> {
  if (!actorId) {
    console.warn(`[poll-summaries] Sin actor para notificar: ${title} — ${message}`);
    return;
  }
  try {
    const { notifyModuleAction } = await import("@/actions/notifications");
    await notifyModuleAction({
      tenantId,
      actorId,
      moduleCodes: ["ventas.comprobantes"],
      title,
      message,
      type: "warning",
      // Imprescindible: esto corre dentro de `/api/fact/sync/pull`, donde no hay
      // cookie de sesión. Con el cliente de cookies el INSERT lo bloquea RLS y la
      // notificación no llega a existir.
      asSystem: true,
    });
  } catch (err) {
    console.error("[poll-summaries] No se pudo notificar:", err);
  }
}
