"use client";

import { useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale/es";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DayScheduleSummary } from "@/types/reservation";

interface CalendarMonthViewProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onDayClick: (date: string) => void;
  daySummaries: DayScheduleSummary[];
  isLoading: boolean;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

function getHeatmapClass(summary: DayScheduleSummary | undefined): string {
  if (!summary || summary.total_capacity === 0) return "";
  const pct = summary.occupancy_percent;
  if (pct > 80) return "bg-red-50 dark:bg-red-950/30";
  if (pct >= 50) return "bg-amber-50 dark:bg-amber-950/30";
  return "bg-emerald-50 dark:bg-emerald-950/30";
}

function getBookedBadgeVariant(
  summary: DayScheduleSummary | undefined
): string {
  if (!summary || summary.total_booked === 0) return "";
  const pct = summary.occupancy_percent;
  if (pct > 80) return "bg-destructive text-white";
  if (pct >= 50) return "bg-warning text-white";
  return "bg-success text-white";
}

export function CalendarMonthView({
  currentDate,
  onDateChange,
  onDayClick,
  daySummaries,
  isLoading,
}: CalendarMonthViewProps) {
  const today = new Date();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd]
  );

  const summaryMap = useMemo(() => {
    const map = new Map<string, DayScheduleSummary>();
    for (const s of daySummaries) {
      map.set(s.date, s);
    }
    return map;
  }, [daySummaries]);

  const handlePrev = () => onDateChange(subMonths(currentDate, 1));
  const handleNext = () => onDateChange(addMonths(currentDate, 1));
  const handleToday = () => onDateChange(new Date());

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: es });

  return (
    <div className="rounded-xl border bg-card p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={handlePrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={handleNext}>
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize text-foreground">
            {monthLabel}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={handleToday}>
          <CalendarDays className="mr-1.5 size-4" />
          Hoy
        </Button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      {isLoading ? (
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg md:h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px">
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, today);
            const summary = summaryMap.get(dateStr);
            const heatmap = getHeatmapClass(summary);
            const badgeVariant = getBookedBadgeVariant(summary);

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onDayClick(dateStr)}
                className={cn(
                  "group relative flex min-h-16 flex-col items-start rounded-lg border border-transparent p-1.5 text-left transition-colors duration-150 hover:border-border hover:bg-muted/40 md:min-h-20 md:p-2",
                  heatmap,
                  !inMonth && "opacity-40"
                )}
              >
                {/* Day number */}
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-medium md:size-7 md:text-sm",
                    isToday &&
                      "bg-primary text-primary-foreground ring-2 ring-primary/30",
                    !isToday && "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>

                {/* Reservation count badge */}
                {summary && summary.total_booked > 0 && (
                  <span
                    className={cn(
                      "mt-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none md:text-xs",
                      badgeVariant
                    )}
                  >
                    {summary.total_booked}
                  </span>
                )}

                {/* Capacity indicator for medium+ screens */}
                {summary && summary.total_capacity > 0 && (
                  <span className="mt-0.5 hidden text-[10px] text-muted-foreground md:inline">
                    {summary.total_booked}/{summary.total_capacity}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-emerald-50 ring-1 ring-emerald-200" />
          {"< 50%"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-amber-50 ring-1 ring-amber-200" />
          50–80%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-red-50 ring-1 ring-red-200" />
          {"> 80%"}
        </span>
      </div>
    </div>
  );
}
