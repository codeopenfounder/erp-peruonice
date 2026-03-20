"use client";

import { useState, useMemo } from "react";
import {
  QrCode,
  UserPlus,
  Building2,
  Users,
  Trash2,
  Pencil,
  Shield,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import {
  useLectorUsers,
  useEmployeesForLector,
  useCreateLectorAssignment,
  useUpdateLectorAssignment,
  useDeleteLectorAssignment,
} from "@/hooks/queries/use-lector-config";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { usePermissions } from "@/hooks/use-permissions";
import type { ColumnDef } from "@tanstack/react-table";
import type { LectorUserListItem } from "@/actions/lector-config";

const CARGO_LABELS: Record<string, { label: string; color: string }> = {
  gerente: { label: "Gerente", color: "bg-blue-500/10 text-blue-600" },
  supervisor: { label: "Supervisor", color: "bg-amber-500/10 text-amber-600" },
  control_acceso: {
    label: "Control de Acceso",
    color: "bg-emerald-500/10 text-emerald-600",
  },
};

export default function PoiLectorPage() {
  const { canCreate, canEdit } = usePermissions();
  const hasCreate = canCreate("config.poi_lector");
  const hasEdit = canEdit("config.poi_lector");

  const { data: users, isLoading } = useLectorUsers();
  const { data: employees } = useEmployeesForLector();
  const { data: branches } = useBranchesForSelect();
  const createMutation = useCreateLectorAssignment();
  const updateMutation = useUpdateLectorAssignment();
  const deleteMutation = useDeleteLectorAssignment();

  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<LectorUserListItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");

  // KPIs
  const totalAssigned = users?.length ?? 0;
  const uniqueBranches = useMemo(
    () => new Set((users || []).map((u) => u.branch_id)).size,
    [users]
  );

  const columns = useMemo<ColumnDef<LectorUserListItem>[]>(
    () => [
      {
        accessorKey: "user_name",
        header: "Nombre",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.user_name}</p>
            {row.original.user_email &&
              !row.original.user_email.includes("@poi.internal") && (
                <p className="text-xs text-muted-foreground">
                  {row.original.user_email}
                </p>
              )}
          </div>
        ),
      },
      {
        accessorKey: "cargo",
        header: "Cargo",
        cell: ({ row }) => {
          const info = CARGO_LABELS[row.original.cargo] ?? {
            label: row.original.cargo,
            color: "bg-muted text-muted-foreground",
          };
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${info.color}`}
            >
              {info.label}
            </span>
          );
        },
      },
      {
        accessorKey: "branch_name",
        header: "Sede",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Building2 className="size-3.5 text-muted-foreground" />
            <span>{row.original.branch_name}</span>
          </div>
        ),
      },
      {
        accessorKey: "has_pin",
        header: "PIN",
        cell: ({ row }) => (
          <span
            className={`text-xs ${row.original.has_pin ? "text-emerald-500" : "text-destructive"}`}
          >
            {row.original.has_pin ? "Configurado" : "Sin PIN"}
          </span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {hasEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    setEditItem(row.original);
                    setSelectedBranchId(row.original.branch_id);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteId(row.original.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [hasEdit]
  );

  const handleCreate = async () => {
    if (!selectedUserId || !selectedBranchId) {
      toast.error("Seleccione un usuario y una sede");
      return;
    }
    const result = await createMutation.mutateAsync({
      user_id: selectedUserId,
      branch_id: selectedBranchId,
    });
    if (result.success) {
      toast.success("Usuario asignado al lector");
      setCreateOpen(false);
      setSelectedUserId("");
      setSelectedBranchId("");
    } else {
      toast.error(
        typeof result.error === "string" ? result.error : "Error al asignar"
      );
    }
  };

  const handleUpdate = async () => {
    if (!editItem || !selectedBranchId) return;
    const result = await updateMutation.mutateAsync({
      id: editItem.id,
      data: { branch_id: selectedBranchId },
    });
    if (result.success) {
      toast.success("Sede actualizada");
      setEditItem(null);
    } else {
      toast.error(
        typeof result.error === "string" ? result.error : "Error al actualizar"
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const result = await deleteMutation.mutateAsync(deleteId);
    if (result.success) {
      toast.success("Acceso al lector revocado");
    } else {
      toast.error(
        typeof result.error === "string" ? result.error : "Error al revocar"
      );
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="POI Lector"
        description="Gestión de acceso al lector QR de control de acceso"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              asChild
            >
              <a href="https://lector.peruonice.com" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 size-4" />
                Abrir POI Lector
              </a>
            </Button>
            {hasCreate && (
              <Button onClick={() => setCreateOpen(true)}>
                <UserPlus className="mr-2 size-4" />
                Asignar usuario
              </Button>
            )}
          </div>
        }
      />

      {/* KPIs */}
      {isLoading ? (
        <KpiGrid>
          <Skeleton className="h-[120px] rounded-xl" />
          <Skeleton className="h-[120px] rounded-xl" />
        </KpiGrid>
      ) : (
        <KpiGrid>
          <KpiCard
            title="Usuarios asignados"
            value={totalAssigned}
            description="Con acceso al lector QR"
            icon={Users}
            variant="primary"
          />
          <KpiCard
            title="Sedes con lector"
            value={uniqueBranches}
            description="Sedes con personal asignado"
            icon={Building2}
            variant="default"
          />
        </KpiGrid>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <Shield className="mt-0.5 size-5 shrink-0 text-blue-500" />
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">
            Control de acceso por cargo
          </p>
          <p className="text-muted-foreground">
            Solo los cargos <strong>Gerente</strong>,{" "}
            <strong>Supervisor</strong> y <strong>Control de Acceso</strong>{" "}
            pueden usar el lector. Los cajeros no tienen acceso.
          </p>
        </div>
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={users ?? []}
        isLoading={isLoading}
        emptyMessage="No hay usuarios asignados al lector"
        emptyActionLabel={hasCreate ? "Asignar usuario" : undefined}
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar usuario al lector</DialogTitle>
            <DialogDescription>
              Seleccione un empleado y la sede donde operará el lector QR.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Empleado</Label>
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un empleado" />
                </SelectTrigger>
                <SelectContent>
                  {(employees || []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <div className="flex items-center gap-2">
                        <span>{e.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({CARGO_LABELS[e.cargo]?.label ?? e.cargo})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                  {employees?.length === 0 && (
                    <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                      No hay empleados disponibles
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sede</Label>
              <Select
                value={selectedBranchId}
                onValueChange={setSelectedBranchId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione una sede" />
                </SelectTrigger>
                <SelectContent>
                  {(branches || []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !selectedUserId ||
                !selectedBranchId ||
                createMutation.isPending
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar sede</DialogTitle>
            <DialogDescription>
              Cambiar la sede de {editItem?.user_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Nueva sede</Label>
            <Select
              value={selectedBranchId}
              onValueChange={setSelectedBranchId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(branches || []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!selectedBranchId || updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Revocar acceso al lector"
        description="Este usuario ya no podrá iniciar sesión en el lector QR."
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
