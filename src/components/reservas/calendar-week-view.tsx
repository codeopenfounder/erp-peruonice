"use client";

import { useMemo } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  isSameDay,
} from "date-fns";
import { es } from "date-fns/locale/es";
import { ChevronLeft, ChevronRight, CalendarDays, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CapacityBar } from "@/components/reservas/capacity-bar";
import { useAvailableSlots } from "@/hooks/queries/use-schedules";
import { cn } from "@/lib/utils";
import type { TimeSlot } from "@/types/reservation";

interface CalendarWeekViewProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onSlotClick: (
    date: string,
    productId: string,
    branchId: string,
    slotStart: string,
    slotEnd: string,
    capacity: number
  ) => void;
  productId: string | null;
  branchId: string | null;
}

function formatTimeLabel(time: string): string {
  // "HH:mm:ss" or "HH:mm" -> "HH:mm"
  return time.slice(0, 5);
}

function DayColumn({
  day,
  productId,
  branchId,
  onSlotClick,
}: {
  day: Date;
  productId: string;
  branchId: string;
  onSlotClick: CalendarWeekViewProps["onSlotClick"];
}) {
  const dateStr = format(day, "yyyy-MM-dd");
  const { data, isLoading } = useAvailableSlots(productId, branchId, dateStr);

  const slots: TimeSlot[] = Array.isArray(data) ? data : [];

  const today = new Date();
  const isToday = isSameDay(day, today);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col rounded-lg border p-2",
        isToday && "border-primary/40 bg-primary/5"
      )}
    >
      {/* Day header */}
      <div className="mb-2 text-center">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {format(day, "EEE", { locale: es })}
        </p>
        <p
          className={cn(
            "mt-0.5 inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold",
            isToday && "bg-primary text-primary-foreground"
          )}
        >
          {format(day, "d")}
        </p>
      </div>

      {/* Slots */}
      <div className="flex flex-1 flex-col gap-1.5">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))
        ) : slots.length === 0 ? (
          <p className="py-4 text-center text-[10px] text-muted-foreground">
            Sin turnos
          </p>
        ) : (
          slots.map((slot) => {
            const pct =
              slot.capacity > 0
                ? (slot.reserved_count / slot.capacity) * 100
                : 0;
            return (
              <button
                key={`${slot.slot_start}-${slot.slot_end}`}
                type="button"
                onClick={() =>
                  onSlotClick(
                    dateStr,
                    productId,
                    branchId,
                    slot.slot_start,
                    slot.slot_end,
                    slot.capacity
                  )
                }
                className={cn(
                  "group rounded-md border p-1.5 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-muted/50",
                  pct > 80 && "border-red-200 dark:border-red-800",
                  pct >= 50 && pct <= 80 && "border-amber-200 dark:border-amber-800"
                )}
              >
                <p className="text-[10px] font-medium text-foreground">
                  {formatTimeLabel(slot.slot_start)}
                </p>
                <CapacityBar
                  booked={slot.reserved_count}
                  capacity={slot.capacity}
                  size="sm"
                  showLabel={false}
                  className="mt-1"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {slot.reserved_count}/{slot.capacity}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function CalendarWeekView({
  currentDate,
  onDateChange,
  onSlotClick,
  productId,
  branchId,
}: CalendarWeekViewProps) {
  const weekStartDate = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(currentDate, { weekStartsOn: 1 });

  const days = useMemo(
    () => eachDayOfInterval({ start: weekStartDate, end: weekEndDate }),
    [weekStartDate, weekEndDate]
  );

  const handlePrev = () => onDateChange(subWeeks(currentDate, 1));
  const handleNext = () => onDateChange(addWeeks(currentDate, 1));
  const handleToday = () => onDateChange(new Date());

  const weekLabel = `Semana del ${format(weekStartDate, "d", { locale: es })} al ${format(weekEndDate, "d 'de' MMM yyyy", { locale: es })}`;

  const hasSelection = !!productId && !!branchId;

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
          <h2 className="text-lg font-semibold text-foreground">{weekLabel}</h2>
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
            Seleccione un servicio y una sede para ver disponibilidad
          </p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map((day) => (
            <DayColumn
              key={format(day, "yyyy-MM-dd")}
              day={day}
              productId={productId!}
              branchId={branchId!}
              onSlotClick={onSlotClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
