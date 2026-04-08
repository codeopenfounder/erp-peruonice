"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, Eye, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { StockBadge } from "./stock-badge";
import { CURRENCIES } from "@/lib/constants/sunat";
import { SUNAT_UNITS_OF_MEASURE } from "@/lib/constants/sunat";
import type { SupplyListItem } from "@/types/supply";

interface SupplyColumnActions {
  onView: (supply: SupplyListItem) => void;
  onEdit: (supply: SupplyListItem) => void;
  onDelete: (id: string, name: string) => void;
  onAddStock?: (supply: SupplyListItem) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function getSupplyColumns(
  actions: SupplyColumnActions
): ColumnDef<SupplyListItem>[] {
  return [
    {
      accessorKey: "image_url",
      header: "",
      cell: ({ row }) => {
        const url = row.original.image_url;
        return (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
            {url ? (
              <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground/50">IMG</span>
            )}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "sku",
      header: "SKU",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.sku}
        </span>
      ),
    },
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: "Nombre",
      cell: ({ row }) => (
        <div className="min-w-[150px]">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{row.original.name}</span>
          </div>
          {row.original.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {row.original.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: tag.color ? `${tag.color}20` : undefined,
                    color: tag.color || undefined,
                    border: `1px solid ${tag.color || "var(--border)"}30`,
                  }}
                >
                  {tag.name}
                </span>
              ))}
              {row.original.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{row.original.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "categories",
      header: "Categorías",
      cell: ({ row }) => {
        const cats = row.original.categories;
        if (!cats || cats.length === 0) return <span className="text-xs text-muted-foreground">&mdash;</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {cats.map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {c.name}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "unit_of_measure",
      header: "UdM",
      cell: ({ row }) => {
        const code = row.original.unit_of_measure;
        const label = SUNAT_UNITS_OF_MEASURE[code as keyof typeof SUNAT_UNITS_OF_MEASURE] ?? code;
        return <span className="text-xs text-muted-foreground">{label}</span>;
      },
    },
    {
      accessorKey: "stock_quantity",
      header: "Stock",
      cell: ({ row }) => (
        <StockBadge
          quantity={row.original.stock_quantity}
          minStock={row.original.min_stock}
          type="product"
        />
      ),
    },
    {
      accessorKey: "cost_price",
      header: "Costo",
      cell: ({ row }) => {
        const cost = row.original.cost_price;
        if (cost == null) return <span className="text-xs text-muted-foreground">&mdash;</span>;
        const symbol = CURRENCIES[row.original.currency]?.symbol ?? "S/.";
        return (
          <span className="font-mono text-sm tabular-nums">
            {symbol} {cost.toFixed(2)}
          </span>
        );
      },
    },
    {
      accessorKey: "available_in_pos",
      header: "POS",
      cell: ({ row }) =>
        row.original.available_in_pos ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/30">
            POS
          </span>
        ) : null,
    },
    {
      accessorKey: "is_active",
      header: "Estado",
      cell: ({ row }) => (
        <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const supply = row.original;
        const showEdit = actions.canEdit !== false;
        const showDelete = actions.canDelete !== false;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => actions.onView(supply)}>
                <Eye className="mr-2 size-4" />
                Ver detalle
              </DropdownMenuItem>
              {showEdit && (
                <DropdownMenuItem onClick={() => actions.onEdit(supply)}>
                  <Pencil className="mr-2 size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {showEdit && actions.onAddStock && (
                <DropdownMenuItem onClick={() => actions.onAddStock!(supply)}>
                  <PackagePlus className="mr-2 size-4" />
                  Anadir stock
                </DropdownMenuItem>
              )}
              {showDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => actions.onDelete(supply.id, supply.name)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
