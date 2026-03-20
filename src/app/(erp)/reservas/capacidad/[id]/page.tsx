"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  updateCapacityGroupSchema,
  type UpdateCapacityGroupSchemaType,
} from "@/lib/validators/capacity-group";
import {
  useCapacityGroupById,
  useAvailableSchedules,
  useUpdateCapacityGroup,
  useDeleteCapacityGroup,
} from "@/hooks/queries/use-capacity-groups";
import { usePermissions } from "@/hooks/use-permissions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CapacidadDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { canEdit, canDelete } = usePermissions();
  const hasEdit = canEdit("reservas.capacidad");
  const hasDelete = canDelete("reservas.capacidad");

  const { data: group, isLoading } = useCapacityGroupById(id);
  const updateMutation = useUpdateCapacityGroup();
  const deleteMutation = useDeleteCapacityGroup();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const { data: availableSchedules, isLoading: isLoadingSchedules } =
    useAvailableSchedules(group?.branch_id ?? "", id);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<UpdateCapacityGroupSchemaType>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(updateCapacityGroupSchema) as any,
    defaultValues: {
      name: "",
      shared_capacity: 60,
      is_active: true,
      schedule_ids: [],
    },
  });

  // Populate form when group data loads
  useEffect(() => {
    if (group) {
      const memberIds = (group.members || []).map((m) => m.schedule_id);
      reset({
        name: group.name,
        shared_capacity: group.shared_capacity,
        is_active: group.is_active,
        schedule_ids: memberIds,
      });
      setSelectedScheduleIds(memberIds);
    }
  }, [group, reset]);

  const watchedIsActive = watch("is_active");

  const toggleSchedule = (scheduleId: string) => {
    const next = selectedScheduleIds.includes(scheduleId)
      ? selectedScheduleIds.filter((sid) => sid !== scheduleId)
      : [...selectedScheduleIds, scheduleId];
    setSelectedScheduleIds(next);
    setValue("schedule_ids", next, { shouldValidate: true });
  };

  const onSubmit = async (data: UpdateCapacityGroupSchemaType) => {
    try {
      const result = await updateMutation.mutateAsync({
        id,
        data: data as Record<string, unknown>,
      });
      if (result && typeof result === "object" && "success" in result && result.success) {
        toast.success("Grupo de capacidad actualizado exitosamente");
        setIsEditing(false);
      } else {
        toast.error("Error al actualizar el grupo");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al actualizar el grupo";
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    try {
      const result = await deleteMutation.mutateAsync(id);
      if (result.success) {
        toast.success("Grupo de capacidad eliminado exitosamente");
        router.push("/reservas/capacidad");
      } else {
        toast.error("Error al eliminar el grupo");
      }
    } catch {
      toast.error("Error al eliminar el grupo");
    }
    setShowDeleteDialog(false);
  };

  const handleCancelEdit = () => {
    if (group) {
      const memberIds = (group.members || []).map((m) => m.schedule_id);
      reset({
        name: group.name,
        shared_capacity: group.shared_capacity,
        is_active: group.is_active,
        schedule_ids: memberIds,
      });
      setSelectedScheduleIds(memberIds);
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[72px] w-full rounded-xl" />
        <Skeleton className="h-[200px] w-full rounded-xl" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Grupo no encontrado"
          description="El grupo de capacidad solicitado no existe"
          actions={
            <Button variant="outline" onClick={() => router.push("/reservas/capacidad")}>
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Button>
          }
        />
      </div>
    );
  }

  const isPending = updateMutation.isPending;

  // Combine current members + available schedules for the editing list
  const allScheduleOptions = [
    ...(group.members || []).map((m) => ({
      id: m.schedule_id,
      product_name: m.product_name ?? "Sin nombre",
      interval_minutes: m.interval_minutes ?? 0,
    })),
    ...(availableSchedules || []).filter(
      (s) => !group.members?.some((m) => m.schedule_id === s.id)
    ),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={group.name}
        description={`Sede: ${group.branch_name}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/reservas/capacidad")}>
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Button>
            {hasEdit && !isEditing && (
              <Button onClick={() => setIsEditing(true)}>
                Editar
              </Button>
            )}
            {hasDelete && !isEditing && (
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive hover:text-white"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Eliminar
              </Button>
            )}
          </div>
        }
      />

      {/* Group info card (read-only) */}
      {!isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>Informacion del grupo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Nombre</p>
                <p className="text-sm font-medium">{group.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Sede</p>
                <p className="text-sm font-medium">{group.branch_name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Capacidad compartida</p>
                <p className="text-sm font-medium">{group.shared_capacity}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Estado</p>
                <StatusBadge status={group.is_active ? "active" : "inactive"} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members list (read-only) */}
      {!isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>Horarios vinculados</CardTitle>
            <CardDescription>
              {group.member_count ?? 0} horario{(group.member_count ?? 0) !== 1 ? "s" : ""} comparten esta capacidad
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!group.members || group.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay horarios vinculados a este grupo
              </p>
            ) : (
              <div className="space-y-2">
                {group.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <span className="text-sm font-medium">{member.product_name}</span>
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {member.interval_minutes} min
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit form */}
      {isEditing && (
        <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Editar grupo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Branch (readonly) */}
              <div className="space-y-2">
                <Label>Sede</Label>
                <Input value={group.branch_name ?? ""} disabled />
                <p className="text-xs text-muted-foreground">
                  La sede no puede cambiarse una vez creado el grupo
                </p>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre del grupo</Label>
                <Input
                  id="edit-name"
                  placeholder="Ej: Pista de hielo - Capacidad compartida"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>

              {/* Shared Capacity */}
              <div className="space-y-2">
                <Label htmlFor="edit-capacity">Capacidad compartida</Label>
                <Input
                  id="edit-capacity"
                  type="number"
                  min={1}
                  max={99999}
                  {...register("shared_capacity")}
                />
                {errors.shared_capacity && (
                  <p className="text-xs text-destructive">{errors.shared_capacity.message}</p>
                )}
              </div>

              {/* Active switch */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Estado activo</Label>
                  <p className="text-xs text-muted-foreground">
                    Los grupos inactivos no comparten capacidad
                  </p>
                </div>
                <Switch
                  checked={watchedIsActive}
                  onCheckedChange={(checked) =>
                    setValue("is_active", checked, { shouldValidate: true })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Horarios del grupo</CardTitle>
              <CardDescription>
                Seleccione los horarios que comparten esta capacidad
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingSchedules ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Cargando horarios...
                </div>
              ) : allScheduleOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay horarios disponibles en esta sede
                </p>
              ) : (
                <div className="space-y-2">
                  {allScheduleOptions.map((schedule) => {
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
              <Button type="button" variant="outline" onClick={handleCancelEdit}>
                <X className="mr-2 size-4" />
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                {isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Eliminar grupo de capacidad"
        description="Este grupo se eliminara permanentemente junto con todas las asignaciones de horarios. Los horarios quedaran libres para reasignacion."
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
