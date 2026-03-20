"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Trash2, Search, ArrowDown, ShoppingCart, Plus, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getMovementColumns } from "@/components/inventario/movement-columns";
import {
  useInventoryMovements,
  useMovementKPIs,
} from "@/hooks/queries/use-inventory-movements";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { exportFlatData } from "@/lib/utils/export-flat";
import { usePermissions } from "@/hooks/use-permissions";
import type { InventoryMovementFilters, InventoryMovementType, EntityType } from "@/types/inventory-movement";

const PAGE_SIZE = 50;

const MOVEMENT_TYPE_OPTIONS: { value: InventoryMovementType; label: string }[] = [
  { value: "waste", label: "Merma" },
  { value: "shrinkage", label: "Perdida/Robo" },
  { value: "staff_consumption", label: "Consumo Personal" },
  { value: "breakage", label: "Rotura" },
  { value: "adjustment", label: "Ajuste" },
  { value: "transfer", label: "Transferencia" },
  { value: "income", label: "Ingreso" },
  { value: "outcome", label: "Egreso" },
  { value: "sale", label: "Venta" },
];

export default function MovimientosPageWrapper() {
  return (
    <Suspense fallback={<div className="space-y-6"><Skeleton className="h-16 w-full" /><Skeleton className="h-96 w-full rounded-xl" /></div>}>
      <MovimientosPage />
    </Suspense>
  );
}

function MovimientosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canCreate } = usePermissions();

  // Pre-fill filters from URL params (e.g. from entity detail "Ver todos" link)
  const urlEntityType = searchParams.get("entity_type");
  const urlEntityId = searchParams.get("entity_id");

  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<string>(
    urlEntityType === "product" || urlEntityType === "supply" ? urlEntityType : "all",
  );
  const [movementType, setMovementType] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, entityType, movementType, branchId, dateFrom, dateTo, timeFrom, timeTo]);

  const filters = useMemo<InventoryMovementFilters>(
    () => ({
      search: search || undefined,
      entity_type: entityType !== "all" ? (entityType as EntityType) : undefined,
      movement_type: movementType !== "all" ? (movementType as InventoryMovementType) : undefined,
      branch_id: branchId !== "all" ? branchId : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      time_from: timeFrom || undefined,
      time_to: timeTo || undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
      // If we have a specific entity_id from URL, pass it as a filter
      ...(urlEntityId ? { entity_id: urlEntityId } : {}),
    }),
    [search, entityType, movementType, branchId, dateFrom, dateTo, timeFrom, timeTo, page, urlEntityId]
  );

  const { data: movementData, isLoading, isFetching } = useInventoryMovements(filters);
  const { data: kpis, isLoading: isLoadingKPIs } = useMovementKPIs();
  const { data: branches } = useBranchesForSelect();

  const columns = useMemo(() => getMovementColumns(), []);

  const handleExport = async () => {
    if (!movementData?.data?.length) return;
    await exportFlatData({
      filename: `movimientos-${new Date().toISOString().split("T")[0]}`,
      sheetName: "Movimientos",
      reportTitle: "Movimientos de Inventario",
      columns: [
        {
          header: "Fecha",
          key: "created_at",
          width: 20,
          format: (v) => {
            const d = new Date(v as string);
            return d.toLocaleDateString("es-PE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
          },
        },
        {
          header: "Tipo",
          key: "movement_type",
          width: 18,
          format: (v) =>
            MOVEMENT_TYPE_OPTIONS.find((m) => m.value === v)?.label || String(v),
        },
        {
          header: "Entidad",
          key: "entity_type",
          width: 12,
          format: (v) => (v === "product" ? "Producto" : "Insumo"),
        },
        { header: "Nombre", key: "entity_name", width: 25, format: (v) => (v as string) || "\u2014" },
        { header: "SKU", key: "entity_sku", width: 14, format: (v) => (v as string) || "\u2014" },
        { header: "Cantidad", key: "quantity", width: 10 },
        { header: "Motivo", key: "reason", width: 25, format: (v) => (v as string) || "\u2014" },
        { header: "Sede", key: "branch_name", width: 16, format: (v) => (v as string) || "\u2014" },
        { header: "Creado por", key: "created_by_name", width: 20, format: (v) => (v as string) || "\u2014" },
      ],
      data: movementData.data as unknown as Record<string, unknown>[],
      format: "xlsx",
    });
    toast.success("Excel exportado exitosamente");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimientos de inventario"
        description="Mermas, perdidas, ajustes y otros movimientos"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!movementData?.data?.length}
            >
              <Download className="mr-2 size-4" />
              Exportar
            </Button>
            {canCreate("inventario.movimientos") && (
              <Button onClick={() => router.push("/inventario/movimientos/nuevo")}>
                <Plus className="mr-2 size-4" />
                Nuevo movimiento
              </Button>
            )}
          </div>
        }
      />

      {/* KPIs */}
      {isLoadingKPIs ? (
        <KpiGrid>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </KpiGrid>
      ) : (
        <KpiGrid>
          <KpiCard
            title="Total movimientos"
            value={kpis?.total_movements ?? 0}
            description="Registrados"
            icon={ArrowLeftRight}
            variant="primary"
          />
          <KpiCard
            title="Mermas"
            value={kpis?.waste_count ?? 0}
            description="Mermas registradas"
            icon={Trash2}
            variant="danger"
          />
          <KpiCard
            title="Perdidas"
            value={kpis?.shrinkage_count ?? 0}
            description="Perdidas y robos"
            icon={Search}
            variant="warning"
          />
          <KpiCard
            title="Ingresos"
            value={kpis?.income_count ?? 0}
            description="Ingresos de stock"
            icon={ArrowDown}
            variant="default"
          />
          <KpiCard
            title="Ventas"
            value={kpis?.sale_count ?? 0}
            description="Ventas registradas"
            icon={ShoppingCart}
            variant="success"
          />
        </KpiGrid>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nombre o SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="product">Producto</SelectItem>
            <SelectItem value="supply">Insumo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={movementType} onValueChange={setMovementType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tipo de movimiento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {MOVEMENT_TYPE_OPTIONS.map((mt) => (
              <SelectItem key={mt.value} value={mt.value}>
                {mt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas las sedes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sedes</SelectItem>
            {branches?.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px]"
            placeholder="Desde"
          />
          <Input
            type="time"
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            className="w-[120px]"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px]"
            placeholder="Hasta"
          />
          <Input
            type="time"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            className="w-[120px]"
          />
        </div>
        {/* Show active entity filter indicator */}
        {urlEntityId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/inventario/movimientos")}
            className="text-xs"
          >
            Limpiar filtro de entidad
          </Button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={movementData?.data ?? []}
        manualPagination
        pageCount={movementData?.totalPages ?? 0}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={movementData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay movimientos registrados"
        emptyActionLabel="Crear movimiento"
        emptyActionHref="/inventario/movimientos/nuevo"
      />
    </div>
  );
}
