"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreateUserDialog } from "@/components/config/create-user-dialog";
import { PermissionsDialog } from "@/components/config/permissions-dialog";
import { getUserColumns } from "@/components/config/user-columns";
import { useUsers, useToggleUserActive, useDeleteUser } from "@/hooks/queries/use-users";
import { usePermissions } from "@/hooks/use-permissions";
import type { UserWithPermissions } from "@/actions/users";

export default function UsuariosPage() {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [permissionsUser, setPermissionsUser] =
    React.useState<UserWithPermissions | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<UserWithPermissions | null>(null);

  const { data: users, isLoading } = useUsers();
  const toggleMutation = useToggleUserActive();
  const deleteMutation = useDeleteUser();
  const { isOwner } = usePermissions();

  const handleEditPermissions = (user: UserWithPermissions) => {
    setPermissionsUser(user);
  };

  const handleToggleActive = async (userId: string) => {
    const result = await toggleMutation.mutateAsync(userId);
    if (result.success) {
      toast.success("Estado actualizado");
    } else {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "Error al cambiar estado",
      );
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const result = await deleteMutation.mutateAsync(deleteTarget.id);
    if (result.success) {
      toast.success(result.message || "Usuario eliminado");
    } else {
      toast.error(
        typeof result.error === "string"
          ? result.error
          : "Error al eliminar usuario",
      );
    }
    setDeleteTarget(null);
  };

  const columns = getUserColumns({
    onEditPermissions: handleEditPermissions,
    onToggleActive: handleToggleActive,
    onDeleteUser: setDeleteTarget,
    isOwner,
  });

  const deleteTargetName = deleteTarget
    ? `${deleteTarget.first_name} ${deleteTarget.last_name}`.trim()
    : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios y Acceso"
        description="Gestiona los usuarios y sus permisos"
        actions={
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="mr-2 size-4" />
            Nuevo usuario
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={users ?? []}
        isLoading={isLoading}
        searchKey="email"
        searchPlaceholder="Buscar por email..."
        emptyMessage="No hay usuarios registrados. Cree el primer usuario."
      />

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      <PermissionsDialog
        open={!!permissionsUser}
        onOpenChange={(open) => {
          if (!open) setPermissionsUser(null);
        }}
        user={permissionsUser}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estas seguro de eliminar a <strong>{deleteTargetName}</strong>?
              Esta accion no se puede deshacer. Se desvincularan todos sus
              registros asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
