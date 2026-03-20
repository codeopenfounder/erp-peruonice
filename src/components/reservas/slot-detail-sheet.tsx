"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { CapacityBar } from "@/components/reservas/capacity-bar";
import { useReservationsBySlot } from "@/hooks/queries/use-reservations";
import { CalendarDays, Clock, Users } from "lucide-react";
import type { Reservation, ReservationStatus } from "@/types/reservation";

interface SlotDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  branchId: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  capacity: number;
}

const STATUS_MAP: Record<ReservationStatus, { label: string; status: string }> = {
  confirmed: { label: "Confirmada", status: "active" },
  cancelled: { label: "Cancelada", status: "cancelled" },
  completed: { label: "Completada", status: "approved" },
  no_show: { label: "No asistio", status: "rejected" },
};

function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export function SlotDetailSheet({
  open,
  onOpenChange,
  productId,
  branchId,
  date,
  slotStart,
  slotEnd,
  capacity,
}: SlotDetailSheetProps) {
  const { data, isLoading } = useReservationsBySlot(
    productId,
    branchId,
    date,
    slotStart
  );

  const reservations: Reservation[] = Array.isArray(data) ? data : [];
  const totalBooked = reservations
    .filter((r) => r.status !== "cancelled")
    .reduce((sum, r) => sum + r.quantity, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Detalle del turno</SheetTitle>
          <SheetDescription>
            Reservas para el turno seleccionado
          </SheetDescription>
        </SheetHeader>

        {/* Slot info header */}
        <div className="space-y-3 px-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 text-muted-foreground" />
              {formatDate(date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 text-muted-foreground" />
              {slotStart} - {slotEnd}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4 text-muted-foreground" />
              {totalBooked}/{capacity}
            </span>
          </div>
          <CapacityBar booked={totalBooked} capacity={capacity} size="md" showLabel={false} />
        </div>

        {/* Reservation list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <div className="space-y-3 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : reservations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Users className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No hay reservas en este horario
              </p>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {reservations.map((reservation) => {
                const statusInfo = STATUS_MAP[reservation.status];
                return (
                  <div
                    key={reservation.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {reservation.quantity}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {reservation.customer_name || "Sin nombre"}
                      </p>
                      {reservation.customer_document_number && (
                        <p className="truncate text-xs text-muted-foreground">
                          {reservation.customer_document_number}
                        </p>
                      )}
                    </div>
                    <StatusBadge
                      status={statusInfo.status}
                      customLabel={statusInfo.label}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
