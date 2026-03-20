"use client";

import {
  format,
  parseISO,
  addDays,
  subDays,
} from "date-fns";
import { es } from "date-fns/locale/es";
import { ChevronLeft, ChevronRight, CalendarDays, Info, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CapacityBar } from "@/components/reservas/capacity-bar";
import { useAvailableSlots } from "@/hooks/queries/use-schedules";
import { cn } from "@/lib/utils";
import type { TimeSlot } from "@/types/reservation";

interface CalendarDayViewProps {
  date: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  productId: string | null;
  branchId: string | null;
  onSlotClick: (slotStart: string, slotEnd: string, capacity: number) => void;
}

function formatTimeLabel(time: string): string {
  return time.slice(0, 5);
}

function getSlotColorClass(pct: number): string {
  if (pct > 80) return "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20";
  if (pct >= 50) return "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20";
  if (pct > 0) return "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20";
  return "border-border";
}

function getSlotAccentClass(pct: number): string {
  if (pct > 80) return "bg-destructive";
  if (pct >= 50) return "bg-warning";
  return "bg-success";
}

export function CalendarDayView({
  date,
  onDateChange,
  productId,
  branchId,
  onSlotClick,
}: CalendarDayViewProps) {
  const parsedDate = parseISO(date);

  const { data, isLoading } = useAvailableSlots(
    productId ?? "",
    branchId ?? "",
    date
  );

  const slots: TimeSlot[] = Array.isArray(data) ? data : [];

  const handlePrev = () =>
    onDateChange(format(subDays(parsedDate, 1), "yyyy-MM-dd"));
  const handleNext = () =>
    onDateChange(format(addDays(parsedDate, 1), "yyyy-MM-dd"));
  const handleToday = () => onDateChange(format(new Date(), "yyyy-MM-dd"));

  const dayLabel = format(parsedDate, "EEEE, d 'de' MMMM yyyy", {
    locale: es,
  });

  const hasSelection = !!productId && !!branchId;

  // Summary stats
  const totalCapacity = slots.reduce((acc, s) => acc + s.capacity, 0);
  const totalBooked = slots.reduce((acc, s) => acc + s.reserved_count, 0);
  const overallPct = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={handlePrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={handleNext}>
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize text-foreground">
            {dayLabel}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={handleToday}>
          <CalendarDays className="mr-1.5 size-4" />
          Hoy
        </Button>
      </div>

      {/* Content */}
      {!hasSelection ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16">
          <Info className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Seleccione un servicio y una sede para ver los turnos del dia
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16">
          <Clock className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No hay turnos configurados para este dia
          </p>
        </div>
      ) : (
        <>
          {/* Day summary bar */}
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3">
            <div className="flex-1">
              <CapacityBar
                booked={totalBooked}
                capacity={totalCapacity}
                size="md"
                showLabel={false}
              />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{totalBooked}</span>/{totalCapacity} reservas
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{overallPct}%</span> ocupacion
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{slots.length}</span> turnos
              </span>
            </div>
          </div>

          {/* Timeline slots */}
          <div className="space-y-2">
            {slots.map((slot) => {
              const pct =
                slot.capacity > 0
                  ? (slot.reserved_count / slot.capacity) * 100
                  : 0;
              const colorClass = getSlotColorClass(pct);
              const accentClass = getSlotAccentClass(pct);

              return (
                <button
                  key={`${slot.slot_start}-${slot.slot_end}`}
                  type="button"
                  onClick={() =>
                    onSlotClick(slot.slot_start, slot.slot_end, slot.capacity)
                  }
                  className={cn(
                    "group flex w-full items-center gap-4 rounded-lg border p-3 text-left transition-colors duration-150 hover:border-primary/40 hover:shadow-sm md:p-4",
                    colorClass
                  )}
                >
                  {/* Accent bar */}
                  <div
                    className={cn(
                      "hidden h-10 w-1 shrink-0 rounded-full md:block",
                      accentClass
                    )}
                  />

                  {/* Time label */}
                  <div className="w-28 shrink-0">
                    <p className="text-sm font-semibold text-foreground">
                      {formatTimeLabel(slot.slot_start)} -{" "}
                      {formatTimeLabel(slot.slot_end)}
                    </p>
                  </div>

                  {/* Capacity bar */}
                  <div className="min-w-0 flex-1">
                    <CapacityBar
                      booked={slot.reserved_count}
                      capacity={slot.capacity}
                      size="md"
                      showLabel={false}
                    />
                  </div>

                  {/* Count label */}
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {slot.reserved_count}/{slot.capacity}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {slot.available} disponible{slot.available !== 1 ? "s" : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
