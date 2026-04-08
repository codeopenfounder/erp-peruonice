"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PromotionStatusBadge } from "./promotion-status-badge";
import type { PromotionListItem } from "@/types/promotion";

interface PromotionColumnActions {
  onView: (promo: PromotionListItem) => void;
  onEdit: (promo: PromotionListItem) => void;
  onDelete: (id: string, name: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  percentage: "Porcentaje",
  fixed_amount: "Monto fijo",
};

export function getPromotionColumns(actions: PromotionColumnActions): ColumnDef<PromotionListItem>[] {
  return [
    {
      accessorKey: "code",
      header: "Código",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "discount_type",
      header: "Tipo",
      cell: ({ row }) => {
        if (row.original.is_combo) {
          return <span className="text-sm font-medium text-primary">Combo</span>;
        }
        return (
          <span className="text-sm text-muted-foreground">
            {DISCOUNT_TYPE_LABELS[row.original.discount_type] ?? row.original.discount_type}
          </span>
        );
      },
    },
    {
      id: "discount",
      header: "Descuento",
      cell: ({ row }) => {
        if (row.original.is_combo) {
          return <span className="font-mono text-sm">S/. {(Number(row.original.combo_price) || 0).toFixed(2)}</span>;
        }
        const { discount_type, discount_value } = row.original;
        if (discount_type === "percentage") return <span className="font-mono text-sm">{discount_value}%</span>;
        return <span className="font-mono text-sm">S/. {discount_value.toFixed(2)}</span>;
      },
    },
    {
      id: "validity",
      header: "Vigencia",
      cell: ({ row }) => {
        const { valid_from, valid_until } = row.original;
        if (!valid_from && !valid_until) return <span className="text-xs text-muted-foreground">Permanente</span>;
        return (
          <div className="text-xs text-muted-foreground">
            {valid_from && <span>{format(new Date(valid_from), "dd/MM/yy")}</span>}
            {valid_from && valid_until && <span> - </span>}
            {valid_until && <span>{format(new Date(valid_until), "dd/MM/yy")}</span>}
          </div>
        );
      },
    },
    {
      id: "usage",
      header: "Uso",
      cell: ({ row }) => {
        const { stock, used_count } = row.original;
        if (stock === null) return <span className="text-xs text-muted-foreground">{used_count} usos</span>;
        return (
          <span className="font-mono text-xs">
            {used_count}/{stock}
          </span>
        );
      },
    },
    {
      accessorKey: "computed_status",
      header: "Estado",
      cell: ({ row }) => <PromotionStatusBadge status={row.original.computed_status} />,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const promo = row.original;
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
              <DropdownMenuItem onClick={() => actions.onView(promo)}>
                <Eye className="mr-2 size-4" />
                Ver detalle
              </DropdownMenuItem>
              {showEdit && (
                <DropdownMenuItem onClick={() => actions.onEdit(promo)}>
                  <Pencil className="mr-2 size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {showDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => actions.onDelete(promo.id, promo.name)}
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
