"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Shield, Power, Eye, EyeOff, Trash2 } from "lucide-react";
import type { UserWithPermissions } from "@/actions/users";

interface ColumnActions {
  onEditPermissions: (user: UserWithPermissions) => void;
  onToggleActive: (userId: string) => void;
  onDeleteUser: (user: UserWithPermissions) => void;
  isOwner: boolean;
}

const CARGO_BADGE_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  gerente: {
    label: "Gerente",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  supervisor: {
    label: "Supervisor",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  cajero: {
    label: "Cajero",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  control_acceso: {
    label: "Control Acceso",
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
};

function PinCell({ pin }: { pin: string | null }) {
  const [visible, setVisible] = React.useState(false);
  if (!pin) return <span className="text-sm text-muted-foreground italic">-</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs tracking-widest">
        {visible ? pin : "••••"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff className="size-3.5 text-muted-foreground" />
        ) : (
          <Eye className="size-3.5 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}

export function getUserColumns(
  actions: ColumnActions,
): ColumnDef<UserWithPermissions>[] {
  return [
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {row.original.first_name} {row.original.last_name}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => {
        const email = row.original.email;
        // Hide internal placeholder emails for cajeros
        if (email.endsWith("@poi.internal")) {
          return <span className="text-sm text-muted-foreground italic">-</span>;
        }
        return (
          <span className="text-sm text-muted-foreground">{email}</span>
        );
      },
    },
    {
      accessorKey: "cargo",
      header: "Cargo",
      cell: ({ row }) => {
        const cargo = row.original.cargo || "cajero";
        const style = CARGO_BADGE_STYLES[cargo] || CARGO_BADGE_STYLES.cajero;
        return (
          <Badge variant="outline" className={style.className}>
            {row.original.is_owner ? "Propietario" : style.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "pin_code",
      header: "PIN",
      cell: ({ row }) => <PinCell pin={row.original.pin_code} />,
    },
    {
      accessorKey: "is_active",
      header: "Estado",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={
            row.original.is_active
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/15 text-red-400 border-red-500/30"
          }
        >
          {row.original.is_active ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => actions.onEditPermissions(row.original)}
            >
              <Shield className="mr-2 size-4" />
              Editar permisos
            </DropdownMenuItem>
            {!row.original.is_owner && (
              <DropdownMenuItem
                onClick={() => actions.onToggleActive(row.original.id)}
              >
                <Power className="mr-2 size-4" />
                {row.original.is_active ? "Desactivar" : "Activar"}
              </DropdownMenuItem>
            )}
            {actions.isOwner && !row.original.is_owner && (
              <DropdownMenuItem
                onClick={() => actions.onDeleteUser(row.original)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                Eliminar usuario
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
