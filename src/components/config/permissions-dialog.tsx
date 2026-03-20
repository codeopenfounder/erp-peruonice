"use client";

import * as React from "react";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useUpdatePermissions } from "@/hooks/queries/use-users";
import { MODULE_AREAS, ALL_MODULES, type ModuleAction } from "@/lib/constants/modules";
import type { UserWithPermissions } from "@/actions/users";
import type { UserPermissionInput } from "@/lib/validators/user";

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithPermissions | null;
}

type ActionKey = "can_view" | "can_create" | "can_edit" | "can_delete";

const ACTION_LABELS: { key: ActionKey; label: string }[] = [
  { key: "can_view", label: "Ver" },
  { key: "can_create", label: "Crear" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Eliminar" },
];

function buildInitialState(
  user: UserWithPermissions | null,
): Record<string, UserPermissionInput> {
  const state: Record<string, UserPermissionInput> = {};
  for (const mod of ALL_MODULES) {
    const existing = user?.permissions.find((p) => p.module_code === mod.code);
    state[mod.code] = {
      module_code: mod.code,
      can_view: existing?.can_view ?? false,
      can_create: existing?.can_create ?? false,
      can_edit: existing?.can_edit ?? false,
      can_delete: existing?.can_delete ?? false,
    };
  }
  return state;
}

export function PermissionsDialog({
  open,
  onOpenChange,
  user,
}: PermissionsDialogProps) {
  const updateMutation = useUpdatePermissions();
  const [perms, setPerms] = React.useState<Record<string, UserPermissionInput>>(
    {},
  );

  React.useEffect(() => {
    if (open && user) {
      setPerms(buildInitialState(user));
    }
  }, [open, user]);

  const toggleAction = (moduleCode: string, action: ActionKey) => {
    setPerms((prev) => ({
      ...prev,
      [moduleCode]: {
        ...prev[moduleCode],
        [action]: !prev[moduleCode]?.[action],
      },
    }));
  };

  const ACTION_TO_AVAILABLE: Record<ActionKey, ModuleAction> = {
    can_view: "view",
    can_create: "create",
    can_edit: "edit",
    can_delete: "delete",
  };

  const isAreaAllSelected = (areaKey: string): boolean => {
    const areaModules = ALL_MODULES.filter((m) => m.area === areaKey);
    return areaModules.every((mod) => {
      const p = perms[mod.code];
      return mod.availableActions.every((action) => {
        const key = `can_${action}` as ActionKey;
        return p?.[key];
      });
    });
  };

  const toggleArea = (areaKey: string) => {
    const allSelected = isAreaAllSelected(areaKey);
    const areaModules = ALL_MODULES.filter((m) => m.area === areaKey);
    const newPerms = { ...perms };
    for (const mod of areaModules) {
      newPerms[mod.code] = {
        module_code: mod.code,
        can_view: mod.availableActions.includes("view") ? !allSelected : false,
        can_create: mod.availableActions.includes("create") ? !allSelected : false,
        can_edit: mod.availableActions.includes("edit") ? !allSelected : false,
        can_delete: mod.availableActions.includes("delete") ? !allSelected : false,
      };
    }
    setPerms(newPerms);
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      const permissionsList = Object.values(perms);
      const result = await updateMutation.mutateAsync({
        userId: user.id,
        permissions: permissionsList,
      });
      if (result.success) {
        toast.success("Permisos actualizados");
        onOpenChange(false);
      } else {
        toast.error(
          typeof result.error === "string"
            ? result.error
            : "Error al actualizar permisos",
        );
      }
    } catch {
      toast.error("Error al actualizar permisos");
    }
  };

  const isOwner = user?.is_owner ?? false;
  const isCajero = user?.cargo === "cajero";
  const isControlAcceso = user?.cargo === "control_acceso";
  const isPosOnly = isCajero || isControlAcceso;
  const userName = user
    ? `${user.first_name} ${user.last_name}`.trim()
    : "";

  const modulesByArea = React.useMemo(() => {
    const grouped: Record<string, typeof ALL_MODULES> = {};
    for (const area of MODULE_AREAS) {
      grouped[area.key] = ALL_MODULES.filter((m) => m.area === area.key);
    }
    return grouped;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Permisos de {userName}
          </DialogTitle>
        </DialogHeader>

        {isPosOnly && (
          <div className="text-center py-8">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {isCajero
                ? "Los cajeros solo acceden a POI Fact"
                : "Los usuarios de control de acceso solo acceden a POI Lector"}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              No requieren permisos del sistema web
            </p>
          </div>
        )}

        {!isPosOnly && isOwner && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <Badge
              variant="outline"
              className="bg-amber-500/15 text-amber-400 border-amber-500/30"
            >
              Propietario
            </Badge>
            <span className="text-sm text-muted-foreground">
              Los propietarios tienen acceso completo a todos los modulos.
            </span>
          </div>
        )}

        {!isPosOnly && (
          <div className="space-y-6">
            {MODULE_AREAS.map((area) => {
              const areaModules = modulesByArea[area.key] || [];
              if (areaModules.length === 0) return null;

              return (
                <div key={area.key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      {area.label}
                    </h3>
                    {!isOwner && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => toggleArea(area.key)}
                      >
                        {isAreaAllSelected(area.key)
                          ? "Deseleccionar todo"
                          : "Seleccionar todo"}
                      </button>
                    )}
                  </div>

                  <div className="rounded-lg border border-border">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_repeat(4,64px)] items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Modulo
                      </span>
                      {ACTION_LABELS.map((a) => (
                        <span
                          key={a.key}
                          className="text-center text-xs font-medium text-muted-foreground"
                        >
                          {a.label}
                        </span>
                      ))}
                    </div>

                    {/* Module rows */}
                    {areaModules.map((mod, i) => {
                      const p = perms[mod.code];
                      return (
                        <div
                          key={mod.code}
                          className={`grid grid-cols-[1fr_repeat(4,64px)] items-center gap-2 px-4 py-2.5 ${
                            i < areaModules.length - 1
                              ? "border-b border-border"
                              : ""
                          }`}
                        >
                          <div>
                            <span className="text-sm font-medium">
                              {mod.label}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {mod.description}
                            </p>
                          </div>
                          {ACTION_LABELS.map((a) => {
                            const available = mod.availableActions.includes(
                              ACTION_TO_AVAILABLE[a.key],
                            );
                            return (
                              <div
                                key={a.key}
                                className="flex items-center justify-center"
                              >
                                {available ? (
                                  <Checkbox
                                    checked={isOwner ? true : p?.[a.key] ?? false}
                                    disabled={isOwner}
                                    onCheckedChange={() =>
                                      toggleAction(mod.code, a.key)
                                    }
                                  />
                                ) : (
                                  <span className="text-muted-foreground/30">&mdash;</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  <Separator />
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            {isPosOnly ? "Cerrar" : "Cancelar"}
          </Button>
          {!isOwner && !isPosOnly && (
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar Permisos
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
