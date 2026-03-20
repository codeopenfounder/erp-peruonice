"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import {
  createCapacityGroupSchema,
  type CreateCapacityGroupSchemaType,
} from "@/lib/validators/capacity-group";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import {
  useAvailableSchedules,
  useCreateCapacityGroup,
} from "@/hooks/queries/use-capacity-groups";

export default function NuevoCapacidadPage() {
  const router = useRouter();
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCapacityGroupSchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createCapacityGroupSchema) as any,
    defaultValues: {
      branch_id: "",
      name: "",
      shared_capacity: 60,
      schedule_ids: [],
    },
  });

  const { data: branches } = useBranchesForSelect();
  const watchedBranchId = watch("branch_id");
  const { data: availableSchedules, isLoading: isLoadingSchedules } =
    useAvailableSchedules(watchedBranchId);
  const createMutation = useCreateCapacityGroup();

  // When branch changes, clear selected schedules
  const handleBranchChange = (branchId: string) => {
    setValue("branch_id", branchId, { shouldValidate: true });
    setSelectedScheduleIds([]);
    setValue("schedule_ids", [], { shouldValidate: true });
  };

  const toggleSchedule = (scheduleId: string) => {
    const next = selectedScheduleIds.includes(scheduleId)
      ? selectedScheduleIds.filter((id) => id !== scheduleId)
      : [...selectedScheduleIds, scheduleId];
    setSelectedScheduleIds(next);
    setValue("schedule_ids", next, { shouldValidate: true });
  };

  const onSubmit = async (data: CreateCapacityGroupSchemaType) => {
    try {
      const result = await createMutation.mutateAsync(data as Record<string, unknown>);
      if (result && typeof result === "object" && "success" in result && result.success) {
        toast.success("Grupo de capacidad creado exitosamente");
        router.push("/reservas/capacidad");
      } else {
        toast.error("Error al crear el grupo");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al crear el grupo";
      toast.error(message);
    }
  };

  const isPending = createMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo Grupo de Capacidad"
        description="Crea un grupo para compartir capacidad entre servicios"
        actions={
          <Button variant="outline" onClick={() => router.push("/reservas/capacidad")}>
            <ArrowLeft className="mr-2 size-4" />
            Volver
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Sede y datos del grupo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Branch select */}
            <div className="space-y-2">
              <Label>Sede</Label>
              <Select
                value={watchedBranchId}
                onValueChange={handleBranchChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccione una sede" />
                </SelectTrigger>
                <SelectContent>
                  {branches?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branch_id && (
                <p className="text-xs text-destructive">{errors.branch_id.message}</p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="group-name">Nombre del grupo</Label>
              <Input
                id="group-name"
                placeholder="Ej: Pista de hielo - Capacidad compartida"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Shared Capacity */}
            <div className="space-y-2">
              <Label htmlFor="shared-capacity">Capacidad compartida</Label>
              <Input
                id="shared-capacity"
                type="number"
                min={1}
                max={99999}
                {...register("shared_capacity")}
              />
              <p className="text-xs text-muted-foreground">
                Capacidad maxima compartida entre todos los servicios del grupo
              </p>
              {errors.shared_capacity && (
                <p className="text-xs text-destructive">{errors.shared_capacity.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horarios del grupo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!watchedBranchId ? (
              <p className="text-sm text-muted-foreground">
                Seleccione una sede para ver los horarios disponibles
              </p>
            ) : isLoadingSchedules ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Cargando horarios...
              </div>
            ) : !availableSchedules || availableSchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay horarios disponibles en esta sede. Todos los horarios ya pertenecen a otro grupo o no hay horarios configurados.
              </p>
            ) : (
              <div className="space-y-2">
                {availableSchedules.map((schedule) => {
                  const isSelected = selectedScheduleIds.includes(schedule.id);
                  return (
                    <label
                      key={schedule.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSchedule(schedule.id)}
                      />
                      <div className="flex flex-1 items-center justify-between">
                        <span className="text-sm font-medium">{schedule.product_name}</span>
                        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {schedule.interval_minutes} min
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            {errors.schedule_ids && (
              <p className="text-xs text-destructive">{errors.schedule_ids.message}</p>
            )}
            {selectedScheduleIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedScheduleIds.length} horario{selectedScheduleIds.length !== 1 ? "s" : ""} seleccionado{selectedScheduleIds.length !== 1 ? "s" : ""}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Sticky footer actions */}
        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-2xl justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/reservas/capacidad")}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" />
              )}
              {isPending ? "Creando..." : "Crear grupo"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
