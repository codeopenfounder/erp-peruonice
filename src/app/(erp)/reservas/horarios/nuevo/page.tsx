"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ScheduleForm } from "@/components/reservas/schedule-form";

export default function NuevoHorarioPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo horario" description="Configura el horario de atención para un servicio" />
      <div className="mx-auto max-w-2xl">
        <ScheduleForm />
      </div>
    </div>
  );
}
