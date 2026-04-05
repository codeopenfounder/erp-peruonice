"use client";

import * as React from "react";
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Users,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BranchFormDialog } from "@/components/negocio/branch-form-dialog";
import { getBranchColumns } from "@/components/negocio/branch-columns";
import {
  useBranches,
  useBranchKPIs,
  useToggleBranchStatus,
} from "@/hooks/queries/use-branches";
import { usePermissions } from "@/hooks/use-permissions";
import type { BranchListItem, BranchType } from "@/types/branch";

const KPI_ITEMS = [
  { key: "total_branches", label: "Total Sedes", icon: Building2 },
  { key: "active_branches", label: "Sedes Activas", icon: Activity },
  { key: "total_capacity", label: "Capacidad Total", icon: MapPin },
] as const;

export default function SedesPage() {
  const { canCreate, canEdit } = usePermissions();
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editBranch, setEditBranch] = React.useState<BranchListItem | null>(
    null,
  );

  const filters = {
    search: search || undefined,
    type: (typeFilter as BranchType) || undefined,
  };

  const { data: branches, isLoading } = useBranches(filters);
  const { data: kpis } = useBranchKPIs();
  const toggleMutation = useToggleBranchStatus();

  const handleEdit = (branch: BranchListItem) => {
    setEditBranch(branch);
    setDialogOpen(true);
  };

  const handleToggle = async (id: string) => {
    const result = await toggleMutation.mutateAsync(id);
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

  const hasEdit = canEdit("config.sedes");
  const hasCreate = canCreate("config.sedes");

  const columns = getBranchColumns({
    onEdit: handleEdit,
    onToggleStatus: handleToggle,
    canEdit: hasEdit,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sedes"
        description="Gestione las sedes y sucursales de su empresa"
        actions={
          hasCreate ? (
            <Button
              onClick={() => {
                setEditBranch(null);
                setDialogOpen(true);
              }}
              size="sm"
            >
              <Plus className="mr-2 size-4" />
              Nueva Sede
            </Button>
          ) : undefined
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {KPI_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const value = kpis?.[item.key] ?? 0;
          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <Card className="border-border/50">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {value}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, código o dirección..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo de sede" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="sede_principal">Sede Principal</SelectItem>
            <SelectItem value="sucursal">Sucursal</SelectItem>
            <SelectItem value="oficina">Oficina</SelectItem>
            <SelectItem value="almacen">Almacen</SelectItem>
            <SelectItem value="planta">Planta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={branches ?? []}
        isLoading={isLoading}
        emptyMessage="No se encontraron sedes. Cree la primera sede de su empresa."
      />

      {/* Form dialog */}
      <BranchFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editBranch={editBranch}
      />
    </div>
  );
}
