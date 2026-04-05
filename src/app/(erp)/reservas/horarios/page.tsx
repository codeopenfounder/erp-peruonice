"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, Trash2, Pencil, Eye, Activity } from "lucide-react";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSchedules, useScheduleKPIs, useDeleteSchedule } from "@/hooks/queries/use-schedules";
import { useProducts } from "@/hooks/queries/use-products";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { usePermissions } from "@/hooks/use-permissions";
import type { ScheduleFilters, ServiceSchedule } from "@/types/reservation";

const PAGE_SIZE = 20;

type ScheduleRow = ServiceSchedule & { product_name: string; branch_name: string };

export default function HorariosPage() {
  const router = useRouter();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [selectedProductId, selectedBranchId]);

  const filters = useMemo<ScheduleFilters>(
    () => ({
      product_id: selectedProductId || undefined,
      branch_id: selectedBranchId || undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
    }),
    [selectedProductId, selectedBranchId, page]
  );

  const { data: scheduleData, isLoading, isFetching } = useSchedules(filters);
  const { data: kpis, isLoading: isLoadingKPIs } = useScheduleKPIs();
  const { data: productsData } = useProducts({ type: "service", page: 1, page_size: 100 });
  const { data: branches } = useBranchesForSelect();
  const deleteMutation = useDeleteSchedule();

  const services = Array.isArray(productsData)
    ? productsData
    : (productsData as { data?: { id: string; name: string }[] })?.data ?? [];

  const hasCreate = canCreate("reservas.horarios");
  const hasEdit = canEdit("reservas.horarios");
  const hasDelete = canDelete("reservas.horarios");

  const columns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        accessorKey: "product_name",
        header: "Servicio",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.product_name}</span>
        ),
      },
      {
        accessorKey: "branch_name",
        header: "Sede",
        cell: ({ row }) => row.original.branch_name,
      },
      {
        accessorKey: "interval_minutes",
        header: "Intervalo",
        cell: ({ row }) => `${row.original.interval_minutes} min`,
      },
      {
        accessorKey: "default_capacity",
        header: "Capacidad",
        cell: ({ row }) => row.original.default_capacity,
      },
      {
        accessorKey: "is_active",
        header: "Estado",
        cell: ({ row }) => (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => router.push(`/reservas/horarios/${row.original.id}`)}
            >
              <Eye className="size-3.5" />
            </Button>
            {hasEdit && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => router.push(`/reservas/horarios/${row.original.id}/editar`)}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {hasDelete && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteId(row.original.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [router, hasEdit, hasDelete]
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const result = await deleteMutation.mutateAsync(deleteId);
      if (result.success) {
        if (result.softDeleted) {
          toast.success("Horario desactivado (tiene reservaciones asociadas)");
        } else {
          toast.success("Horario eliminado exitosamente");
        }
      } else {
        toast.error("Error al eliminar el horario");
      }
    } catch {
      toast.error("Error al eliminar el horario");
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Horarios de Atención"
        description="Configura los horarios de atención por servicio"
        actions={
          hasCreate ? (
            <Button onClick={() => router.push("/reservas/horarios/nuevo")}>
              <Plus className="mr-2 size-4" />
              Configurar horario
            </Button>
          ) : undefined
        }
      />

      {isLoadingKPIs ? (
        <KpiGrid>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </KpiGrid>
      ) : (
        <KpiGrid>
          <KpiCard
            title="Con horario"
            value={kpis?.services_with_schedule ?? 0}
            description="Servicios con horario configurado"
            icon={CalendarClock}
            variant="primary"
          />
          <KpiCard
            title="Sin horario"
            value={kpis?.services_without_schedule ?? 0}
            description="Servicios sin horario"
            icon={Activity}
            variant="warning"
          />
          <KpiCard
            title="Total servicios"
            value={kpis?.total_services ?? 0}
            description="Servicios activos"
            icon={Activity}
            variant="default"
          />
        </KpiGrid>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedProductId ?? "all"}
          onValueChange={(v) => setSelectedProductId(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todos los servicios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los servicios</SelectItem>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedBranchId ?? "all"}
          onValueChange={(v) => setSelectedBranchId(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas las sedes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sedes</SelectItem>
            {branches?.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={(scheduleData?.data ?? []) as ScheduleRow[]}
        manualPagination
        pageCount={scheduleData?.totalPages ?? 0}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={scheduleData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay horarios configurados"
        emptyActionLabel="Configurar horario"
        emptyActionHref="/reservas/horarios/nuevo"
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Eliminar horario"
        description="Este horario se eliminará permanentemente. Si tiene reservas activas, se desactivará en su lugar."
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
