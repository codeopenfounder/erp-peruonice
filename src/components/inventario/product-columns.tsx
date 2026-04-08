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
import type { ProductListItem } from "@/types/product";

interface ProductColumnActions {
  onView: (product: ProductListItem) => void;
  onEdit: (product: ProductListItem) => void;
  onDelete: (id: string, name: string) => void;
  onAddStock?: (product: ProductListItem) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function getProductColumns(
  actions: ProductColumnActions,
  showStock = true
): ColumnDef<ProductListItem>[] {
  const columns: ColumnDef<ProductListItem>[] = [
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
      accessorKey: "unit_price",
      header: "Precio",
      cell: ({ row }) => {
        const symbol = CURRENCIES[row.original.currency]?.symbol ?? "S/.";
        return (
          <span className="font-mono text-sm tabular-nums">
            {symbol} {row.original.unit_price.toFixed(2)}
          </span>
        );
      },
    },
  ];

  if (showStock) {
    columns.push({
      accessorKey: "stock_quantity",
      header: "Stock",
      cell: ({ row }) => (
        <StockBadge
          quantity={row.original.stock_quantity}
          minStock={row.original.min_stock}
          type={row.original.type}
        />
      ),
    });
  }

  columns.push(
    {
      accessorKey: "product_kind",
      header: "Tipo",
      cell: ({ row }) => {
        const kind = row.original.product_kind;
        return kind === "composite" ? (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/20">
            Compuesto
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Simple</span>
        );
      },
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
        const product = row.original;
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
              <DropdownMenuItem onClick={() => actions.onView(product)}>
                <Eye className="mr-2 size-4" />
                Ver detalle
              </DropdownMenuItem>
              {showEdit && (
                <DropdownMenuItem onClick={() => actions.onEdit(product)}>
                  <Pencil className="mr-2 size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {showEdit && product.type === "product" && product.product_kind !== "composite" && actions.onAddStock && (
                <DropdownMenuItem onClick={() => actions.onAddStock!(product)}>
                  <PackagePlus className="mr-2 size-4" />
                  Anadir stock
                </DropdownMenuItem>
              )}
              {showDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => actions.onDelete(product.id, product.name)}
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
    }
  );

  return columns;
}
