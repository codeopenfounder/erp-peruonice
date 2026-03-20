"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  CalendarClock,
  Clock,
  Users,
  Building2,
  Briefcase,
  Timer,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SchedulePreview } from "@/components/reservas/schedule-preview";
import { useSchedule } from "@/hooks/queries/use-schedules";
import { usePermissions } from "@/hooks/use-permissions";
import type { ScheduleTimeRange } from "@/types/reservation";

const DAY_NAMES: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function groupRangesByDay(ranges: ScheduleTimeRange[]): Map<number, ScheduleTimeRange[]> {
  const map = new Map<number, ScheduleTimeRange[]>();
  for (const r of ranges) {
    const existing = map.get(r.day_of_week) ?? [];
    existing.push(r);
    map.set(r.day_of_week, existing);
  }
  return map;
}

/** Compute what fraction of 0:00–24:00 a time range covers, for the visual bar */
function timeToPercent(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h * 60 + m) / 1440) * 100;
}

export default function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: schedule, isLoading } = useSchedule(id);
  const { canEdit } = usePermissions();
  const hasEdit = canEdit("reservas.horarios");

  const rangesByDay = useMemo(
    () =>
      schedule?.time_ranges
        ? groupRangesByDay(schedule.time_ranges)
        : new Map<number, ScheduleTimeRange[]>(),
    [schedule?.time_ranges]
  );

  const activeDays = useMemo(
    () => DAY_ORDER.filter((d) => rangesByDay.has(d)),
    [rangesByDay]
  );

  const uniqueTimeRanges = useMemo(() => {
    if (!schedule?.time_ranges) return [];
    const seen = new Set<string>();
    const result: { start_time: string; end_time: string }[] = [];
    for (const r of schedule.time_ranges) {
      const key = `${r.start_time}-${r.end_time}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ start_time: formatTime(r.start_time), end_time: formatTime(r.end_time) });
      }
    }
    return result;
  }, [schedule?.time_ranges]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <p className="text-sm text-muted-foreground">Horario no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={schedule.name || schedule.product_name || "Detalle del horario"}
        description={schedule.name ? schedule.product_name : undefined}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => router.push("/reservas/horarios")}>
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Button>
            {hasEdit && (
              <Button onClick={() => router.push(`/reservas/horarios/${id}/editar`)}>
                <Pencil className="mr-2 size-4" />
                Editar
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* General info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Información general
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow
              icon={<Briefcase className="size-4 text-primary" />}
              label="Servicio"
              value={schedule.product_name || "\u2014"}
            />
            <InfoRow
              icon={<Building2 className="size-4 text-blue-500" />}
              label="Sede"
              value={schedule.branch_name || "\u2014"}
            />
            <InfoRow
              icon={<Timer className="size-4 text-amber-500" />}
              label="Intervalo"
              value={`${schedule.interval_minutes} minutos`}
            />
            <InfoRow
              icon={<Users className="size-4 text-emerald-500" />}
              label="Capacidad por turno"
              value={String(schedule.default_capacity)}
            />
            <InfoRow
              icon={
                schedule.is_active ? (
                  <CircleCheck className="size-4 text-emerald-500" />
                ) : (
                  <CircleX className="size-4 text-destructive" />
                )
              }
              label="Estado"
            >
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  schedule.is_active
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {schedule.is_active ? "Activo" : "Inactivo"}
              </span>
            </InfoRow>
          </CardContent>
        </Card>

        {/* Time ranges by day — visual timeline bars */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Horarios por día
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeDays.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center">
                <CalendarClock className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Sin horarios configurados</p>
              </div>
            ) : (
              activeDays.map((day) => {
                const ranges = rangesByDay.get(day) ?? [];
                return (
                  <div key={day} className="space-y-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      {DAY_NAMES[day]}
                    </span>
                    {/* Timeline bar */}
                    <div className="relative h-7 w-full overflow-hidden rounded-lg bg-muted/50">
                      {/* Hour ticks */}
                      {[6, 9, 12, 15, 18, 21].map((hour) => (
                        <div
                          key={hour}
                          className="absolute top-0 h-full border-l border-dashed border-muted-foreground/15"
                          style={{ left: `${(hour / 24) * 100}%` }}
                        />
                      ))}
                      {/* Range blocks */}
                      {ranges.map((r) => {
                        const left = timeToPercent(r.start_time);
                        const right = timeToPercent(r.end_time);
                        const width = right - left;
                        return (
                          <div
                            key={r.id}
                            className="absolute top-1 bottom-1 rounded-md bg-primary/20 border border-primary/30 transition-colors hover:bg-primary/30"
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${formatTime(r.start_time)} – ${formatTime(r.end_time)}`}
                          >
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-primary truncate px-1">
                              {formatTime(r.start_time)} – {formatTime(r.end_time)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
            {/* Hour legend */}
            {activeDays.length > 0 && (
              <div className="relative mt-1 flex h-4 w-full text-[9px] text-muted-foreground/60">
                {[6, 9, 12, 15, 18, 21].map((hour) => (
                  <span
                    key={hour}
                    className="absolute"
                    style={{ left: `${(hour / 24) * 100}%`, transform: "translateX(-50%)" }}
                  >
                    {`${hour}:00`}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Schedule preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Vista previa de turnos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SchedulePreview
            timeRanges={uniqueTimeRanges}
            intervalMinutes={schedule.interval_minutes}
            capacity={schedule.default_capacity}
            daysOfWeek={activeDays}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="text-right font-medium text-foreground">{children ?? value}</div>
    </div>
  );
}
