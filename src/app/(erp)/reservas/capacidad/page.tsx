"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users2, Plus, Trash2, Pencil, Eye, Link2, Activity } from "lucide-react";
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
import {
  useCapacityGroups,
  useCapacityGroupKPIs,
  useDeleteCapacityGroup,
} from "@/hooks/queries/use-capacity-groups";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { usePermissions } from "@/hooks/use-permissions";
import type { CapacityGroup, CapacityGroupFilters } from "@/types/capacity-group";

const PAGE_SIZE = 20;

export default function CapacidadPage() {
  const router = useRouter();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [selectedBranchId]);

  const filters = useMemo<CapacityGroupFilters>(
    () => ({
      branch_id: selectedBranchId || undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
    }),
    [selectedBranchId, page]
  );

  const { data: groupData, isLoading, isFetching } = useCapacityGroups(filters);
  const { data: kpis, isLoading: isLoadingKPIs } = useCapacityGroupKPIs();
  const { data: branches } = useBranchesForSelect();
  const deleteMutation = useDeleteCapacityGroup();

  const hasCreate = canCreate("reservas.capacidad");
  const hasEdit = canEdit("reservas.capacidad");
  const hasDelete = canDelete("reservas.capacidad");

  const columns = useMemo<ColumnDef<CapacityGroup>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "branch_name",
        header: "Sede",
        cell: ({ row }) => row.original.branch_name,
      },
      {
        accessorKey: "shared_capacity",
        header: "Capacidad",
        cell: ({ row }) => row.original.shared_capacity,
      },
      {
        accessorKey: "member_count",
        header: "Servicios",
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {row.original.member_count ?? 0}
          </span>
        ),
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
              onClick={() => router.push(`/reservas/capacidad/${row.original.id}`)}
            >
              <Eye className="size-3.5" />
            </Button>
            {hasEdit && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => router.push(`/reservas/capacidad/${row.original.id}`)}
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
        toast.success("Grupo de capacidad eliminado exitosamente");
      } else {
        toast.error("Error al eliminar el grupo");
      }
    } catch {
      toast.error("Error al eliminar el grupo");
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos de Capacidad"
        description="Gestiona grupos de capacidad compartida entre servicios"
        actions={
          hasCreate ? (
            <Button onClick={() => router.push("/reservas/capacidad/nuevo")}>
              <Plus className="mr-2 size-4" />
              Nuevo Grupo
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
            title="Total Grupos"
            value={kpis?.total_groups ?? 0}
            description="Grupos activos de capacidad"
            icon={Users2}
            variant="primary"
          />
          <KpiCard
            title="Servicios Vinculados"
            value={kpis?.linked_schedules ?? 0}
            description="Horarios asignados a un grupo"
            icon={Link2}
            variant="success"
          />
          <KpiCard
            title="Capacidad Promedio"
            value={kpis?.avg_capacity ?? 0}
            description="Capacidad compartida promedio"
            icon={Activity}
            variant="default"
          />
        </KpiGrid>
      )}

      <div className="flex flex-wrap items-center gap-3">
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
        data={(groupData?.data ?? []) as CapacityGroup[]}
        manualPagination
        pageCount={groupData?.totalPages ?? 0}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={groupData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay grupos de capacidad configurados"
        emptyActionLabel="Nuevo Grupo"
        emptyActionHref="/reservas/capacidad/nuevo"
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Eliminar grupo de capacidad"
        description="Este grupo se eliminara permanentemente junto con todas las asignaciones de horarios. Los horarios quedarán libres para reasignación."
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
