"use client";

import { CalendarDays, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { useDashboardFilters } from "./dashboard-filters-provider";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

function peruToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

const DATE_PRESETS = [
  { label: "Hoy", getRange: () => { const d = peruToday(); return { from: d, to: d }; } },
  { label: "Ayer", getRange: () => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const d = y.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    return { from: d, to: d };
  }},
  { label: "Esta semana", getRange: () => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    return {
      from: monday.toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
      to: peruToday(),
    };
  }},
  { label: "Este mes", getRange: () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: first.toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
      to: peruToday(),
    };
  }},
  { label: "Mes pasado", getRange: () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      from: first.toLocaleDateString("en-CA"),
      to: last.toLocaleDateString("en-CA"),
    };
  }},
];

function formatDateLabel(from: string, to: string): string {
  const today = peruToday();
  if (from === today && to === today) return "Hoy";
  if (from === to) {
    return new Date(from + "T12:00:00").toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
    });
  }
  const f = new Date(from + "T12:00:00").toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
  const t = new Date(to + "T12:00:00").toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
  return `${f} - ${t}`;
}

export function DashboardFilters() {
  const { filters, setFilters } = useDashboardFilters();
  const { data: branches } = useBranchesForSelect();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const dateRange: DateRange = {
    from: new Date(filters.date_from + "T12:00:00"),
    to: new Date(filters.date_to + "T12:00:00"),
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Date presets */}
      <div className="flex items-center gap-1">
        {DATE_PRESETS.slice(0, 3).map((preset) => {
          const range = preset.getRange();
          const isActive =
            filters.date_from === range.from && filters.date_to === range.to;
          return (
            <Button
              key={preset.label}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                setFilters({ date_from: range.from, date_to: range.to })
              }
            >
              {preset.label}
            </Button>
          );
        })}
      </div>

      {/* Calendar range picker */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateLabel(filters.date_from, filters.date_to)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col gap-1 border-b p-2">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="justify-start text-xs"
                onClick={() => {
                  const range = preset.getRange();
                  setFilters({ date_from: range.from, date_to: range.to });
                  setCalendarOpen(false);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              if (range?.from) {
                setFilters({
                  date_from: range.from.toLocaleDateString("en-CA"),
                  date_to: (range.to || range.from).toLocaleDateString("en-CA"),
                });
                if (range.to) setCalendarOpen(false);
              }
            }}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
          />
        </PopoverContent>
      </Popover>

      {/* Branch filter */}
      {branches && branches.length > 1 && (
        <Select
          value={filters.branch_id || "all"}
          onValueChange={(v) =>
            setFilters({ branch_id: v === "all" ? undefined : v })
          }
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <MapPin className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue placeholder="Todas las sedes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sedes</SelectItem>
            {branches.map((b: { id: string; name: string }) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
