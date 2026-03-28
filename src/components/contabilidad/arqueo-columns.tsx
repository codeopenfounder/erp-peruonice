"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import Link from "next/link";
import type { ArqueoListItem } from "@/types/arqueo";

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--";
  }
}

function formatCurrency(amount: number | null): string {
  if (amount == null) return "--";
  return `S/ ${amount.toFixed(2)}`;
}

function getDifferenceColor(difference: number | null): string {
  if (difference == null) return "text-muted-foreground";
  const abs = Math.abs(difference);
  if (abs === 0) return "text-success font-medium";
  if (abs <= 5) return "text-amber-500 font-medium";
  return "text-destructive font-medium";
}

export function getArqueoColumns(): ColumnDef<ArqueoListItem>[] {
  return [
    {
      accessorKey: "created_at",
      header: "Fecha",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {formatDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => {
        const type = row.original.type;
        return type === "cierre" ? (
          <Badge variant="secondary" className="text-[10px]">
            Cierre
          </Badge>
        ) : (
          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
            Sorpresa
          </Badge>
        );
      },
    },
    {
      accessorKey: "cash_register_name",
      header: "Caja",
      cell: ({ row }) => (
        <div className="text-sm">
          <span>{row.original.cash_register_name}</span>
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {row.original.cash_register_code}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "cashier_name",
      header: "Cajero",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.cashier_name || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "supervisor_name",
      header: "Supervisor",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.supervisor_name || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "expected_amount",
      header: () => <div className="text-right">Esperado</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {formatCurrency(row.original.expected_amount)}
        </div>
      ),
    },
    {
      accessorKey: "counted_amount",
      header: () => <div className="text-right">Contado</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-sm tabular-nums">
          {formatCurrency(row.original.counted_amount)}
        </div>
      ),
    },
    {
      accessorKey: "difference",
      header: () => <div className="text-right">Diferencia</div>,
      cell: ({ row }) => {
        const diff = row.original.difference;
        return (
          <div
            className={`text-right font-mono text-sm tabular-nums ${getDifferenceColor(diff)}`}
          >
            {diff != null
              ? `${diff >= 0 ? "+" : ""}S/ ${diff.toFixed(2)}`
              : "--"}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <Link href={`/finanzas/arqueos/${row.original.id}`}>
              <Eye className="size-4" />
            </Link>
          </Button>
        </div>
      ),
    },
  ];
}
