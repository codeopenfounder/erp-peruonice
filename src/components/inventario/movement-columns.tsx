"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { MovementTypeBadge } from "./movement-type-badge";
import { cn } from "@/lib/utils";
import type { InventoryMovement } from "@/types/inventory-movement";

export function getMovementColumns(): ColumnDef<InventoryMovement>[] {
  return [
    {
      accessorKey: "created_at",
      header: "Fecha",
      cell: ({ row }) => {
        const date = new Date(row.original.created_at);
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {date.toLocaleDateString("es-PE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}{" "}
            {date.toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        );
      },
    },
    {
      accessorKey: "movement_type",
      header: "Tipo",
      cell: ({ row }) => <MovementTypeBadge type={row.original.movement_type} />,
    },
    {
      accessorKey: "entity_type",
      header: "Entidad",
      cell: ({ row }) => (
        <span className="rounded-full bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
          {row.original.entity_type === "product" ? "Producto" : "Insumo"}
        </span>
      ),
    },
    {
      id: "entity_name",
      header: "Nombre",
      cell: ({ row }) => (
        <div className="min-w-[120px]">
          <p className="font-medium text-foreground">{row.original.entity_name || "\u2014"}</p>
          <p className="text-[10px] font-mono text-muted-foreground">
            {row.original.entity_sku || ""}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Cantidad",
      cell: ({ row }) => {
        const m = row.original;
        const isAdjustment = m.movement_type === "adjustment";

        let isIncrease: boolean;
        if (isAdjustment) {
          isIncrease = typeof m.notes === "string" && m.notes.includes("dif: +");
        } else {
          isIncrease = m.movement_type === "income" || m.movement_type === "nc_return";
        }

        const sign = isIncrease ? "+" : "\u2212";
        const colorClass = isIncrease ? "text-emerald-500" : "text-destructive";

        return (
          <span className={cn("font-mono text-sm font-semibold tabular-nums", colorClass)}>
            {sign}{m.quantity}
          </span>
        );
      },
    },
    {
      accessorKey: "reason",
      header: "Motivo",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => (
        <span className="max-w-[200px] truncate text-xs text-muted-foreground">
          {row.original.reason || "\u2014"}
        </span>
      ),
    },
    {
      id: "comprobante",
      header: "Comprobante",
      meta: { className: "hidden md:table-cell" },
      cell: ({ row }) => {
        const m = row.original as InventoryMovement & {
          invoice_number?: string | null;
        };
        if ((m.movement_type === "sale" || m.movement_type === "nc_return") && m.invoice_number) {
          return (
            <Link
              href={`/ventas/transacciones?id=${m.invoice_id}`}
              className="font-mono text-xs text-primary hover:underline"
            >
              {m.invoice_number}
            </Link>
          );
        }
        if (m.movement_type === "income" && m.invoice_code) {
          return (
            <div className="text-xs">
              <span className="font-mono">{m.invoice_code}</span>
              {m.supplier_ruc && (
                <p className="text-muted-foreground">RUC: {m.supplier_ruc}</p>
              )}
            </div>
          );
        }
        return <span className="text-muted-foreground">{"\u2014"}</span>;
      },
    },
    {
      accessorKey: "branch_name",
      header: "Sede",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.branch_name || "\u2014"}
        </span>
      ),
    },
    {
      accessorKey: "created_by_name",
      header: "Responsable",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.created_by_name || "\u2014"}
        </span>
      ),
    },
  ];
}
