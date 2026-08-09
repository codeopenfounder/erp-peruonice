"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Eye,
  Copy,
  ExternalLink,
  Download,
  MoreHorizontal,
  RotateCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceStatusBadge } from "@/components/ventas/invoice-status-badge";
import {
  MAX_SUNAT_ATTEMPTS,
  SUNAT_AUTH_FAULTS,
  SUNAT_AUTH_FAULT_REMEDY,
  daysLeftToSend,
  deadlineDaysFor,
  extractSunatCode,
  isProviderAuthFault,
} from "@/lib/sunat/policy";
import { toast } from "sonner";
import type { InvoiceListItem } from "@/types/invoice";

const DOC_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  factura: {
    label: "Factura",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  boleta: {
    label: "Boleta",
    className: "bg-success/10 text-success border-success/20",
  },
  nota_credito: {
    label: "NC",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  nota_debito: {
    label: "ND",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  ticket: {
    label: "Ticket",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function padCorrelative(n: number): string {
  return String(n).padStart(8, "0");
}

/**
 * Días de plazo que quedan. La regla vive en `lib/sunat/policy`, que es la misma
 * que aplican el auto-retry y el botón de reenvío.
 *
 * Esta función tenía su propia tabla de plazos —3 días para factura y ND, 5 para
 * todo lo demás— y se equivocaba en tres casos: la boleta son 7 días, no 5; una
 * NC de factura hereda los 3 de la factura, no los 5 de "todo lo demás"; y una ND
 * de boleta son 7, no 3. El plazo depende del documento afectado, y eso lo dice
 * el primer carácter de la serie, no `document_type`.
 */
function getDaysRemaining(
  issueDate: string,
  seriesCode: string,
  status: string,
): number | null {
  return daysLeftToSend(issueDate, seriesCode, status);
}

/** Estados desde los que tiene sentido reenviar a SUNAT. */
const RETRYABLE_STATUSES = new Set(["issued", "rejected", "sent_to_sunat"]);

/**
 * Comprobante que ya no puede enviarse: se le pasó el plazo legal.
 *
 * Es un estado distinto de «Atascado», y confundirlos cuesta caro. Un atascado se
 * recupera reintentando; un caducado ya no, porque SUNAT lo rechaza con 2600 y el
 * documento perdió la calidad de comprobante de pago aunque el cliente lo tenga en
 * la mano. Lo que toca ahí es contable, no técnico.
 */
export function isSunatExpired(invoice: InvoiceListItem): boolean {
  if (!RETRYABLE_STATUSES.has(invoice.status)) return false;
  const days = daysLeftToSend(
    invoice.issue_date || invoice.created_at,
    invoice.series_code,
    invoice.status,
  );
  return days !== null && days < 0;
}

/**
 * Un comprobante que agotó los reintentos automáticos **y sigue en plazo**.
 *
 * Es el dead-letter: `autoRetrySunat` filtra por `sunat_attempts < 5`, así que al
 * quinto fallo deja de verlo y el comprobante se queda en `issued` **para
 * siempre**, sin estado, sin XML y sin CDR. No había ninguna pantalla del ERP
 * donde apareciera.
 */
export function isSunatStuck(invoice: InvoiceListItem): boolean {
  return (
    RETRYABLE_STATUSES.has(invoice.status) &&
    (invoice.sunat_attempts ?? 0) >= MAX_SUNAT_ATTEMPTS &&
    !isSunatExpired(invoice)
  );
}

export function getInvoiceColumns(
  onView: (id: string) => void,
  onDownloadPdf: (id: string) => void,
  onRetrySunat?: (id: string) => void,
  onCheckVoidTicket?: () => void
): ColumnDef<InvoiceListItem>[] {
  return [
    {
      accessorKey: "document_type",
      header: "Tipo",
      cell: ({ row }) => {
        const docCfg = DOC_TYPE_CONFIG[row.original.document_type] ?? {
          label: row.original.document_type,
          className: "bg-muted text-muted-foreground border-border",
        };
        return (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${docCfg.className}`}>
            {docCfg.label}
          </span>
        );
      },
    },
    {
      id: "numero",
      header: "Nº Documento",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-foreground whitespace-nowrap">
          {row.original.series_code}-{padCorrelative(row.original.correlative_number)}
        </span>
      ),
    },
    {
      accessorKey: "issue_date",
      header: "Fecha Emisión",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {row.original.issue_date
            ? row.original.issue_date.split("-").reverse().join("/")
            : "—"}
        </span>
      ),
    },
    {
      id: "days_remaining",
      header: "Plazo",
      cell: ({ row }) => {
        const inv = row.original;
        const days = getDaysRemaining(
          inv.issue_date || inv.created_at,
          inv.series_code,
          inv.status
        );
        if (days === null) return <span className="text-xs text-muted-foreground">—</span>;
        const limite = deadlineDaysFor(inv.series_code);
        if (days < 0)
          return (
            <span
              className="text-[10px] font-semibold text-destructive"
              title={`El plazo de ${limite} días calendario para enviarlo a SUNAT venció hace ${-days} día(s).`}
            >
              Vencido
            </span>
          );
        if (days === 0)
          return (
            <span
              className="text-[10px] font-semibold text-destructive"
              title="Hoy es el último día para enviarlo a SUNAT."
            >
              Hoy
            </span>
          );
        return (
          <span
            className={`text-xs font-medium ${days <= 1 ? "text-amber-600" : "text-muted-foreground"}`}
            title={`Plazo de ${limite} días calendario desde el día siguiente a la emisión.`}
          >
            {days}d
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <InvoiceStatusBadge status={inv.status} />
            {isProviderAuthFault(inv.sunat_response_code) && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                title={[
                  `SUNAT rechazó las credenciales del emisor, no el comprobante.`,
                  `${extractSunatCode(inv.sunat_response_code)}: ${
                    SUNAT_AUTH_FAULTS[extractSunatCode(inv.sunat_response_code) ?? ""] ??
                    inv.sunat_response_desc
                  }`,
                  SUNAT_AUTH_FAULT_REMEDY[extractSunatCode(inv.sunat_response_code) ?? ""] ?? "",
                  `Afecta a todos los comprobantes, no sólo a este, y se reenviará solo en cuanto se corrija.`,
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              >
                <TriangleAlert className="size-3" />
                Credenciales del emisor
              </span>
            )}
            {isSunatExpired(inv) && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive"
                title={`Se pasó el plazo legal de ${deadlineDaysFor(inv.series_code)} días calendario para enviarlo a SUNAT. Reenviarlo sólo produce el rechazo 2600: el documento ya perdió la calidad de comprobante de pago. La salida es contable, no técnica.`}
              >
                <TriangleAlert className="size-3" />
                Fuera de plazo
              </span>
            )}
            {isSunatStuck(inv) && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
                title={`Se reintentó ${inv.sunat_attempts} veces sin éxito. El reenvío automático ya no lo toma: usa «Reintentar SUNAT».`}
              >
                <TriangleAlert className="size-3" />
                Atascado
              </span>
            )}
            {inv.sunat_ticket_status === "pending" && (
              <span
                className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600"
                title="La baja se envió a SUNAT y devolvió un ticket. Está esperando la respuesta."
              >
                Ticket pendiente
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "total",
      header: () => <span className="block text-right">Total</span>,
      cell: ({ row }) => (
        <span className="block text-right font-mono text-sm font-medium tabular-nums text-foreground">
          S/ {row.original.total.toFixed(2)}
        </span>
      ),
    },
    {
      id: "reference",
      header: "Origen",
      cell: ({ row }) => {
        if (!row.original.reference_series_code) return null;
        return (
          <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
            {row.original.reference_series_code}-
            {padCorrelative(row.original.reference_correlative ?? 0)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(row.original.id)}>
              <Eye className="mr-2 size-3.5" />
              Ver detalle
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownloadPdf(row.original.id)}>
              <Download className="mr-2 size-3.5" />
              Descargar PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.location.href = `/ventas/transacciones?id=${row.original.id}`;
              }}
            >
              <ExternalLink className="mr-2 size-3.5" />
              Ver transacción
            </DropdownMenuItem>
            {/* Fuera de plazo no se ofrece el reenvío: el servidor lo rechazaría
                igualmente, y ofrecer un botón que no puede funcionar invita a
                gastar la tarde en él. */}
            {onRetrySunat &&
              RETRYABLE_STATUSES.has(row.original.status) &&
              !isSunatExpired(row.original) && (
                <DropdownMenuItem onClick={() => onRetrySunat(row.original.id)}>
                  <RotateCcw className="mr-2 size-3.5" />
                  Reintentar SUNAT
                  {(row.original.sunat_attempts ?? 0) > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({row.original.sunat_attempts} intentos)
                    </span>
                  )}
                </DropdownMenuItem>
              )}
            {onCheckVoidTicket && row.original.sunat_ticket_status === "pending" && (
              <DropdownMenuItem onClick={onCheckVoidTicket}>
                <Search className="mr-2 size-3.5" />
                Consultar estado de anulación
              </DropdownMenuItem>
            )}
            {row.original.sunat_response_code && (
              <DropdownMenuItem
                onClick={() => {
                  const info = [
                    `Código: ${row.original.sunat_response_code}`,
                    `Descripción: ${row.original.sunat_response_desc || "—"}`,
                    `ID Documento: ${row.original.sunat_document_id || "—"}`,
                  ].join("\n");
                  navigator.clipboard.writeText(info);
                  toast.success("Respuesta SUNAT copiada");
                }}
              >
                <Copy className="mr-2 size-3.5" />
                Copiar respuesta SUNAT
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
