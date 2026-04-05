"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Power } from "lucide-react";
import type { BranchListItem } from "@/types/branch";

const TYPE_LABELS: Record<string, string> = {
  sede_principal: "Sede Principal",
  sucursal: "Sucursal",
  oficina: "Oficina",
  almacen: "Almacen",
  planta: "Planta",
};

const TYPE_VARIANTS: Record<string, string> = {
  sede_principal: "bg-primary/15 text-primary border-primary/30",
  sucursal: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  oficina: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  almacen: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  planta: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

interface ColumnActions {
  onEdit: (branch: BranchListItem) => void;
  onToggleStatus: (id: string) => void;
  canEdit?: boolean;
}

export function getBranchColumns(
  actions: ColumnActions,
): ColumnDef<BranchListItem>[] {
  return [
    {
      accessorKey: "code",
      header: "Código",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.code}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          {row.original.address && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {row.original.address}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`text-[10px] font-medium ${TYPE_VARIANTS[row.original.type] || ""}`}
        >
          {TYPE_LABELS[row.original.type] || row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: "manager_name",
      header: "Responsable",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.manager_name || (
            <span className="text-muted-foreground italic">Sin asignar</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "is_active",
      header: "Estado",
      cell: ({ row }) => (
        <Badge
          variant={row.original.is_active ? "default" : "secondary"}
          className={
            row.original.is_active
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/15 text-red-400 border-red-500/30"
          }
        >
          {row.original.is_active ? "Activa" : "Inactiva"}
        </Badge>
      ),
    },
    ...(actions.canEdit !== false
      ? [
          {
            id: "actions",
            cell: ({ row }: { row: { original: BranchListItem } }) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => actions.onEdit(row.original)}>
                    <Pencil className="mr-2 size-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => actions.onToggleStatus(row.original.id)}
                  >
                    <Power className="mr-2 size-4" />
                    {row.original.is_active ? "Desactivar" : "Activar"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          } as ColumnDef<BranchListItem>,
        ]
      : []),
  ];
}
