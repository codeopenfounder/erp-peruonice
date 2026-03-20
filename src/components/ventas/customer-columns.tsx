"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { CustomerListItem } from "@/types/invoice";

const DOC_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  ruc: {
    label: "RUC",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  dni: {
    label: "DNI",
    className: "bg-success/10 text-success border-success/20",
  },
  ce: {
    label: "CE",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  passport: {
    label: "Pasaporte",
    className: "bg-accent/10 text-accent border-accent/20",
  },
  sin_documento: {
    label: "Sin doc.",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function getCustomerColumns(): ColumnDef<CustomerListItem>[] {
  return [
    {
      accessorKey: "document_type",
      header: "Tipo",
      cell: ({ row }) => {
        const cfg = DOC_TYPE_CONFIG[row.original.document_type] ?? {
          label: row.original.document_type.toUpperCase(),
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
      accessorKey: "document_number",
      header: "Documento",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-foreground">
          {row.original.document_number}
        </span>
      ),
    },
    {
      accessorKey: "legal_name",
      header: "Razon Social",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-foreground">
          {row.original.legal_name}
        </span>
      ),
    },
    {
      accessorKey: "trade_name",
      header: "Nombre Comercial",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.trade_name || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "address",
      header: "Direccion",
      cell: ({ row }) => (
        <span
          className="max-w-[200px] truncate text-sm text-foreground"
          title={row.original.address || undefined}
        >
          {row.original.address || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.email || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Telefono",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.phone || (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </span>
      ),
    },
  ];
}
