"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ExpenseFundMovementItem } from "@/types/gastos";

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  assignment: {
    label: "Asignación",
    className: "bg-success/10 text-success border-success/20",
  },
  adjustment: {
    label: "Ajuste",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  expense: {
    label: "Egreso",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Lima",
    });
  } catch {
    return "--/--/----";
  }
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Lima",
    });
  } catch {
    return "--:--";
  }
}

export function getExpenseFundMovementsColumns(): ColumnDef<ExpenseFundMovementItem>[] {
  return [
    {
      accessorKey: "created_at",
      header: "Fecha",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm text-foreground">
            {formatDate(row.original.created_at)}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatTime(row.original.created_at)}
          </span>
        </div>
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
      accessorKey: "cash_register_name",
      header: "Caja",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm text-foreground">
            {row.original.cash_register_name || (
              <span className="text-muted-foreground">&mdash;</span>
            )}
          </span>
          {row.original.cash_register_code && (
            <span className="font-mono text-xs text-muted-foreground">
              {row.original.cash_register_code}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "amount",
      header: "Monto",
      cell: ({ row }) => {
        const amount = Number(row.original.amount);
        const isExpense = row.original.type === "expense";
        return (
          <span
            className={`font-mono text-sm font-medium tabular-nums ${
              isExpense ? "text-destructive" : "text-success"
            }`}
          >
            {isExpense ? "-" : ""}S/ {Math.abs(amount).toFixed(2)}
          </span>
        );
      },
    },
    {
      id: "detail",
      header: "Motivo",
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
      accessorKey: "receipt_number",
      header: "N° Factura",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.receipt_number || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "authorized_name",
      header: "Autorizado por",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.authorized_name || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
  ];
}
