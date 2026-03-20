"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { InventoryAudit } from "@/types/inventory-audit";

export function getAuditColumns(): ColumnDef<InventoryAudit>[] {
  return [
    {
      accessorKey: "created_at",
      header: "Fecha",
      cell: ({ row }) => {
        const date = new Date(row.original.created_at);
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {format(date, "dd MMM yyyy", { locale: es })}
          </span>
        );
      },
    },
    {
      accessorKey: "branch_name",
      header: "Sede",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.branch_name || "\u2014"}
        </span>
      ),
    },
    {
      accessorKey: "items_audited",
      header: "Items auditados",
      cell: ({ row }) => (
        <span className="font-mono text-sm tabular-nums">
          {row.original.items_audited}
        </span>
      ),
    },
    {
      accessorKey: "items_adjusted",
      header: "Ajustados",
      cell: ({ row }) => {
        const val = row.original.items_adjusted;
        return (
          <span
            className={cn(
              "font-mono text-sm tabular-nums",
              val > 0 ? "text-amber-400 font-semibold" : "text-muted-foreground"
            )}
          >
            {val}
          </span>
        );
      },
    },
    {
      accessorKey: "total_discrepancy_value",
      header: "Impacto",
      cell: ({ row }) => {
        const val = row.original.total_discrepancy_value;
        return (
          <span
            className={cn(
              "font-mono text-sm tabular-nums font-semibold",
              val < 0
                ? "text-destructive"
                : val > 0
                  ? "text-amber-400"
                  : "text-muted-foreground"
            )}
          >
            {val < 0 ? "-" : val > 0 ? "+" : ""}S/{" "}
            {Math.abs(val).toFixed(2)}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} />
      ),
    },
    {
      accessorKey: "audited_by_name",
      header: "Auditor",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.audited_by_name || "\u2014"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Link href={`/inventario/auditoria/${row.original.id}`}>
          <Button variant="ghost" size="sm">
            <Eye className="mr-1.5 size-3.5" />
            Ver detalle
          </Button>
        </Link>
      ),
    },
  ];
}
