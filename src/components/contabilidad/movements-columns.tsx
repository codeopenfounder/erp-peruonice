"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import type { GastosMovementListItem } from "@/types/gastos";

const TYPE_CONFIG: Record<string, { label: string; className: string; sign: string }> = {
  sale: {
    label: "Venta",
    className: "bg-primary/10 text-primary border-primary/20",
    sign: "+",
  },
  refund: {
    label: "Devolucion",
    className: "bg-warning/10 text-warning border-warning/20",
    sign: "-",
  },
  petty_cash_in: {
    label: "Caja Chica",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    sign: "+",
  },
  income: {
    label: "Ingreso",
    className: "bg-success/10 text-success border-success/20",
    sign: "+",
  },
  expense: {
    label: "Retiro",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    sign: "-",
  },
};

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function formatAmount(amount: number, type: string): { text: string; className: string } {
  const cfg = TYPE_CONFIG[type];
  const sign = cfg?.sign ?? "";
  const isNegative = sign === "-";
  return {
    text: `${sign}S/ ${Math.abs(amount).toFixed(2)}`,
    className: isNegative ? "text-destructive" : "text-success",
  };
}

export function getMovementsColumns(): ColumnDef<GastosMovementListItem>[] {
  return [
    {
      accessorKey: "created_at",
      header: "Hora",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {formatTime(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => {
        const cfg = TYPE_CONFIG[row.original.type] ?? {
          label: row.original.type,
          className: "bg-muted text-muted-foreground border-border",
        };
        return (
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
          >
            {cfg.label}
          </span>
        );
      },
    },
    {
      id: "detail",
      header: "Descripcion / Motivo",
      cell: ({ row }) => {
        const desc = row.original.description || row.original.reason;
        return (
          <span className="max-w-[200px] truncate text-sm text-foreground">
            {desc || <span className="text-muted-foreground">&mdash;</span>}
          </span>
        );
      },
    },
    {
      accessorKey: "created_by_name",
      header: "Responsable",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.created_by_name || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Monto",
      cell: ({ row }) => {
        const { text, className } = formatAmount(
          Number(row.original.amount),
          row.original.type
        );
        return (
          <span className={`font-mono text-sm font-medium tabular-nums ${className}`}>
            {text}
          </span>
        );
      },
    },
    {
      accessorKey: "receipt_number",
      header: "Comprobante",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.receipt_number || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "branch_name",
      header: "Sede",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.branch_name || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "cash_register_name",
      header: "Caja",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.cash_register_name || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      id: "transaction_link",
      header: "",
      cell: ({ row }) => {
        if (!row.original.invoice_id || row.original.type === "expense") return null;
        return (
          <Link
            href={`/ventas/transacciones?id=${row.original.invoice_id}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="size-3" />
            Ver transacción
          </Link>
        );
      },
    },
  ];
}
