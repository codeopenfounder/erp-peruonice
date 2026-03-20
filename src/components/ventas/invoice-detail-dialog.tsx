"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceStatusBadge } from "@/components/ventas/invoice-status-badge";
import { ExternalLink, FileCode } from "lucide-react";
import { useInvoiceDetail } from "@/hooks/queries/use-ventas";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  credit: "Credito",
  mixed: "Mixto",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  factura: "Factura",
  boleta: "Boleta de Venta",
  nota_credito: "Nota de Credito",
  nota_debito: "Nota de Debito",
  ticket: "Ticket",
};

function padCorrelative(n: number): string {
  return String(n).padStart(8, "0");
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export interface InvoiceDetailDialogProps {
  open: boolean;
  invoiceId: string;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceDetailDialog({
  open,
  invoiceId,
  onOpenChange,
}: InvoiceDetailDialogProps) {
  const { data: invoice, isLoading } = useInvoiceDetail(invoiceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {isLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : invoice ? (
              <>
                <span>
                  Comprobante {invoice.series_code}-
                  {padCorrelative(invoice.correlative_number)}
                </span>
                <InvoiceStatusBadge status={invoice.status} />
              </>
            ) : (
              <span>Comprobante no encontrado</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : invoice ? (
          <div className="space-y-6">
            {/* Info Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <InfoRow
                  label="Tipo"
                  value={DOC_TYPE_LABELS[invoice.document_type] ?? invoice.document_type}
                />
                <InfoRow
                  label="Estado SUNAT"
                  value={<InvoiceStatusBadge status={invoice.status} />}
                />
                <InfoRow label="Fecha" value={formatDate(invoice.created_at)} />
                <InfoRow
                  label="Metodo de pago"
                  value={
                    invoice.payment_method
                      ? (PAYMENT_LABELS[invoice.payment_method] ?? invoice.payment_method)
                      : "—"
                  }
                />
              </div>
              <div className="space-y-3">
                <InfoRow
                  label="Cliente"
                  value={invoice.cashier_name ? undefined : "—"}
                >
                  {invoice.customer_id ? (
                    <div className="flex flex-col">
                      <span className="text-sm text-foreground">
                        {/* customer name comes from joined data; fall back to ID */}
                        {(invoice as unknown as Record<string, unknown>).customer_name as string ||
                          "Cliente general"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Cliente general
                    </span>
                  )}
                </InfoRow>
                <InfoRow
                  label="Caja"
                  value={invoice.cash_register_name || "—"}
                />
                <InfoRow
                  label="Sede"
                  value={invoice.branch_name || "—"}
                />
                <InfoRow
                  label="Cajero"
                  value={invoice.cashier_name || "—"}
                />
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Descripcion</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">P. Unit</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">IGV</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell
                        colSpan={6}
                        className="h-16 text-center text-muted-foreground"
                      >
                        Sin items
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoice.items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="border-border hover:bg-secondary/30"
                      >
                        <TableCell className="text-sm text-foreground max-w-[200px] truncate">
                          {item.description}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                          S/ {item.unit_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                          S/ {item.subtotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                          S/ {item.igv_amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums font-medium text-foreground">
                          S/ {item.total.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Op. Gravada</span>
                  <span className="font-mono tabular-nums text-foreground">
                    S/ {invoice.op_gravada.toFixed(2)}
                  </span>
                </div>
                {invoice.op_exonerada > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Op. Exonerada</span>
                    <span className="font-mono tabular-nums text-foreground">
                      S/ {invoice.op_exonerada.toFixed(2)}
                    </span>
                  </div>
                )}
                {invoice.op_inafecta > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Op. Inafecta</span>
                    <span className="font-mono tabular-nums text-foreground">
                      S/ {invoice.op_inafecta.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IGV (18%)</span>
                  <span className="font-mono tabular-nums text-foreground">
                    S/ {invoice.igv_total.toFixed(2)}
                  </span>
                </div>
                {invoice.discount_total > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Descuento</span>
                    <span className="font-mono tabular-nums text-destructive">
                      -S/ {invoice.discount_total.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-sm font-semibold text-foreground">
                    Total
                  </span>
                  <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                    S/ {invoice.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* SUNAT Info */}
            {(invoice.sunat_response_code || invoice.xml_url) && (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">
                  Informacion SUNAT
                </h4>
                {invoice.sunat_response_code && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Codigo respuesta:
                    </span>
                    <span className="font-mono text-foreground">
                      {invoice.sunat_response_code}
                    </span>
                    {invoice.sunat_response_desc && (
                      <span className="text-muted-foreground">
                        — {invoice.sunat_response_desc}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  {invoice.xml_url && (
                    <a
                      href={invoice.xml_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <FileCode className="size-3.5" />
                      Ver XML
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No se pudo cargar el comprobante.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper sub-component
function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children ?? (
        <span className="text-sm text-foreground">
          {typeof value === "string" ? value : value}
        </span>
      )}
    </div>
  );
}
