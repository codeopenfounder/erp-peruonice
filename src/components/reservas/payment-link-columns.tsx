"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { PaymentLinkListItem } from "@/types/payment-link";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    return new Date(dateStr).toLocaleDateString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "--";
  }
}

function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

const STATUS_MAP: Record<string, { label: string; variant: string; className: string }> = {
  pending: { label: "Pendiente", variant: "outline", className: "border-amber-500/30 text-amber-500 bg-amber-500/10" },
  paid: { label: "Pagado", variant: "default", className: "bg-success/10 text-success border-success/30" },
  expired: { label: "Expirado", variant: "secondary", className: "text-muted-foreground" },
  cancelled: { label: "Cancelado", variant: "secondary", className: "text-muted-foreground" },
  failed: { label: "Error", variant: "destructive", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function getPaymentLinkColumns(
  onCancel?: (id: string) => void
): ColumnDef<PaymentLinkListItem>[] {
  return [
    {
      accessorKey: "created_at",
      header: "Fecha",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {formatDate(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => {
        const s = STATUS_MAP[row.original.status] || STATUS_MAP.pending;
        return (
          <Badge variant="outline" className={`text-[10px] ${s.className}`}>
            {s.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "customer_name",
      header: "Cliente",
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-medium">{row.original.customer_name}</div>
          {row.original.customer_phone && (
            <div className="text-xs text-muted-foreground">{row.original.customer_phone}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "product_name",
      header: "Servicio",
      cell: ({ row }) => (
        <div className="text-sm">
          <div>{row.original.product_name || "--"}</div>
          {row.original.reservation_date && (
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.reservation_date} {row.original.slot_start}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Cant.",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.quantity}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: () => <div className="text-right">Monto</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums font-medium">
          {formatCurrency(row.original.amount)}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const link = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {link.culqi_link_url && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Copiar link"
                  onClick={() => {
                    navigator.clipboard.writeText(link.culqi_link_url!);
                    toast.success("Link copiado al portapapeles");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Abrir link"
                  asChild
                >
                  <a
                    href={link.culqi_link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </>
            )}
            {link.status === "pending" && onCancel && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:text-destructive"
                title="Cancelar link"
                onClick={() => onCancel(link.id)}
              >
                <XCircle className="size-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}
