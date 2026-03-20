"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale/es";
import { XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { Reservation, ReservationStatus } from "@/types/reservation";

const STATUS_CONFIG: Record<
  ReservationStatus,
  { label: string; status: string }
> = {
  confirmed: { label: "Confirmada", status: "active" },
  cancelled: { label: "Cancelada", status: "cancelled" },
  completed: { label: "Completada", status: "approved" },
  no_show: { label: "No asistio", status: "pending" },
};

function formatTimeLabel(time: string): string {
  return time.slice(0, 5);
}

export function getReservationColumns(options: {
  onCancel: (id: string) => void;
  canEdit: boolean;
}): ColumnDef<Reservation>[] {
  const { onCancel, canEdit } = options;

  return [
    {
      accessorKey: "reservation_date",
      header: "Fecha",
      cell: ({ row }) => {
        try {
          const parsed = parseISO(row.original.reservation_date);
          return (
            <span className="whitespace-nowrap text-sm">
              {format(parsed, "dd/MM/yyyy", { locale: es })}
            </span>
          );
        } catch {
          return row.original.reservation_date;
        }
      },
    },
    {
      id: "horario",
      header: "Horario",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatTimeLabel(row.original.slot_start)} -{" "}
          {formatTimeLabel(row.original.slot_end)}
        </span>
      ),
    },
    {
      accessorKey: "product_name",
      header: "Servicio",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.product_name ?? "—"}</span>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Cliente",
      cell: ({ row }) => row.original.customer_name || "—",
    },
    {
      accessorKey: "customer_document_number",
      header: "Documento",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.customer_document_number || "—"}
        </span>
      ),
    },
    {
      accessorKey: "quantity",
      header: "Cantidad",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.quantity}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => {
        const statusInfo = STATUS_CONFIG[row.original.status];
        const isCancelled = row.original.status === "cancelled";
        return (
          <span className={cn(isCancelled && "line-through opacity-60")}>
            <StatusBadge
              status={statusInfo?.status ?? row.original.status}
              customLabel={statusInfo?.label}
            />
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const isConfirmed = row.original.status === "confirmed";
        if (!isConfirmed || !canEdit) return null;

        return (
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onCancel(row.original.id)}
              title="Cancelar reserva"
            >
              <XCircle className="size-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];
}
