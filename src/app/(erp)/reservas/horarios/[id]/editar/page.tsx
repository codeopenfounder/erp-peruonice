"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleForm } from "@/components/reservas/schedule-form";
import { useSchedule } from "@/hooks/queries/use-schedules";

export default function EditarHorarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: schedule, isLoading } = useSchedule(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!schedule) {
    return <p className="py-12 text-center text-muted-foreground">Horario no encontrado</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar horario"
        description={schedule.product_name || schedule.name || undefined}
      />
      <div className="mx-auto max-w-2xl">
        <ScheduleForm schedule={schedule} />
      </div>
    </div>
  );
}
