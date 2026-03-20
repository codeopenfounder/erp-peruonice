"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

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
import { SchedulePreview } from "@/components/reservas/schedule-preview";
import {
  createScheduleSchema,
  updateScheduleSchema,
  type CreateScheduleSchemaType,
} from "@/lib/validators/reservation";
import { useProducts } from "@/hooks/queries/use-products";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { useCreateSchedule, useUpdateSchedule } from "@/hooks/queries/use-schedules";
import type { ScheduleWithRanges } from "@/types/reservation";
import { cn } from "@/lib/utils";

interface ScheduleFormProps {
  schedule?: ScheduleWithRanges | null;
}

const INTERVAL_OPTIONS = [
  { value: "15", label: "15 minutos" },
  { value: "30", label: "30 minutos" },
  { value: "45", label: "45 minutos" },
  { value: "60", label: "1 hora" },
  { value: "90", label: "1 hora 30 min" },
  { value: "120", label: "2 horas" },
];

const DAY_LABELS = [
  { value: 1, short: "L" },
  { value: 2, short: "Ma" },
  { value: 3, short: "Mi" },
  { value: 4, short: "J" },
  { value: 5, short: "V" },
  { value: 6, short: "S" },
  { value: 0, short: "D" },
];

function extractDaysFromRanges(ranges: ScheduleWithRanges["time_ranges"]): number[] {
  const days = new Set<number>();
  ranges.forEach((r) => days.add(r.day_of_week));
  return Array.from(days);
}

function extractUniqueTimeRanges(
  ranges: ScheduleWithRanges["time_ranges"]
): { start_time: string; end_time: string }[] {
  const seen = new Set<string>();
  const result: { start_time: string; end_time: string }[] = [];
  for (const r of ranges) {
    const start = r.start_time.slice(0, 5); // "HH:mm:ss" -> "HH:mm"
    const end = r.end_time.slice(0, 5);
    const key = `${start}-${end}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ start_time: start, end_time: end });
    }
  }
  return result.length > 0 ? result : [{ start_time: "", end_time: "" }];
}

export function ScheduleForm({ schedule }: ScheduleFormProps) {
  const router = useRouter();
  const isEditing = !!schedule;

  const { data: productsData } = useProducts({ type: "service", page: 1, page_size: 100 });
  const { data: branchesData } = useBranchesForSelect();

  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();

  const services = (productsData as { data?: { id: string; name: string; branch_id: string | null }[] } | undefined)?.data ?? [];
  const branches = Array.isArray(branchesData) ? branchesData : [];

  const schema = isEditing ? updateScheduleSchema : createScheduleSchema;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateScheduleSchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      product_id: schedule?.product_id ?? "",
      branch_id: schedule?.branch_id ?? "",
      name: schedule?.name ?? "",
      interval_minutes: schedule?.interval_minutes ?? 30,
      default_capacity: schedule?.default_capacity ?? 60,
      days_of_week: schedule ? extractDaysFromRanges(schedule.time_ranges) : [],
      time_ranges: schedule
        ? extractUniqueTimeRanges(schedule.time_ranges)
        : [{ start_time: "", end_time: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "time_ranges",
  });

  // Reset form when schedule prop changes
  useEffect(() => {
    if (schedule) {
      reset({
        product_id: schedule.product_id,
        branch_id: schedule.branch_id,
        name: schedule.name ?? "",
        interval_minutes: schedule.interval_minutes,
        default_capacity: schedule.default_capacity,
        days_of_week: extractDaysFromRanges(schedule.time_ranges),
        time_ranges: extractUniqueTimeRanges(schedule.time_ranges),
      });
    }
  }, [schedule, reset]);

  const watchedDays = watch("days_of_week") ?? [];
  const watchedRanges = watch("time_ranges") ?? [];
  const watchedInterval = watch("interval_minutes") ?? 30;
  const watchedCapacity = watch("default_capacity") ?? 60;
  const watchedProductId = watch("product_id");
  const watchedBranchId = watch("branch_id");

  // Auto-select branch when service changes (services have branch_id)
  const selectedServiceBranch = services.find((s) => s.id === watchedProductId)?.branch_id;
  const isBranchLocked = !!selectedServiceBranch && !isEditing;

  useEffect(() => {
    if (!watchedProductId || isEditing) return;
    const service = services.find((s) => s.id === watchedProductId);
    if (service?.branch_id) {
      setValue("branch_id", service.branch_id, { shouldValidate: true });
    }
  }, [watchedProductId, services, isEditing, setValue]);

  const toggleDay = (day: number) => {
    const current = watchedDays;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    setValue("days_of_week", next, { shouldValidate: true });
  };

  const onSubmit = async (data: CreateScheduleSchemaType) => {
    const result = isEditing
      ? await updateMutation.mutateAsync({
          id: schedule!.id,
          data: data as Record<string, unknown>,
        })
      : await createMutation.mutateAsync(data as Record<string, unknown>);

    if (result && typeof result === "object" && "success" in result && !result.success) {
      const errorMsg =
        "error" in result && typeof result.error === "string"
          ? result.error
          : "Error al guardar el horario";
      toast.error(errorMsg);
      return;
    }

    toast.success(
      isEditing ? "Horario actualizado correctamente" : "Horario creado correctamente"
    );
    router.push("/reservas/horarios");
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Servicio y sede</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Service select */}
          <div className="space-y-2">
            <Label>Servicio</Label>
            <Select
              value={watchedProductId}
              onValueChange={(v) => setValue("product_id", v, { shouldValidate: true })}
              disabled={isEditing}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccione un servicio" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.product_id && (
              <p className="text-xs text-destructive">{errors.product_id.message}</p>
            )}
          </div>

          {/* Branch select */}
          <div className="space-y-2">
            <Label>Sede</Label>
            <Select
              value={watchedBranchId}
              onValueChange={(v) => setValue("branch_id", v, { shouldValidate: true })}
              disabled={isEditing || isBranchLocked}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccione una sede" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isBranchLocked && (
              <p className="text-xs text-muted-foreground">
                Sede asignada automaticamente segun el servicio
              </p>
            )}
            {errors.branch_id && (
              <p className="text-xs text-destructive">{errors.branch_id.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuracion del horario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="schedule-name">Nombre (opcional)</Label>
            <Input
              id="schedule-name"
              placeholder="Ej: Horario entre semana"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Days of week */}
          <div className="space-y-2">
            <Label>Dias de la semana</Label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map(({ value, short }) => {
                const isActive = watchedDays.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
            {errors.days_of_week && (
              <p className="text-xs text-destructive">{errors.days_of_week.message}</p>
            )}
          </div>

          {/* Time ranges */}
          <div className="space-y-3">
            <Label>Rangos horarios</Label>
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-32"
                  {...register(`time_ranges.${index}.start_time`)}
                />
                <span className="text-sm text-muted-foreground">a</span>
                <Input
                  type="time"
                  className="w-32"
                  {...register(`time_ranges.${index}.end_time`)}
                />
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {errors.time_ranges && !Array.isArray(errors.time_ranges) && (
              <p className="text-xs text-destructive">
                {errors.time_ranges.message ?? errors.time_ranges.root?.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => append({ start_time: "", end_time: "" })}
            >
              <Plus className="size-3.5" />
              Agregar rango
            </Button>
          </div>

          {/* Interval + capacity */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Intervalo</Label>
              <Select
                value={String(watchedInterval)}
                onValueChange={(v) =>
                  setValue("interval_minutes", Number(v), { shouldValidate: true })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.interval_minutes && (
                <p className="text-xs text-destructive">
                  {errors.interval_minutes.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacidad por turno</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                max={9999}
                {...register("default_capacity")}
              />
              {errors.default_capacity && (
                <p className="text-xs text-destructive">
                  {errors.default_capacity.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule preview */}
      <Card>
        <CardHeader>
          <CardTitle>Vista previa de turnos</CardTitle>
        </CardHeader>
        <CardContent>
          <SchedulePreview
            timeRanges={watchedRanges}
            intervalMinutes={watchedInterval}
            capacity={watchedCapacity}
            daysOfWeek={watchedDays}
          />
        </CardContent>
      </Card>

      {/* Sticky footer actions */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-2xl justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/reservas/horarios")}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isPending
              ? "Guardando..."
              : isEditing
                ? "Actualizar horario"
                : "Crear horario"}
          </Button>
        </div>
      </div>
    </form>
  );
}
