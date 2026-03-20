"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Warehouse, AlertTriangle, PackageX, ShoppingCart, Plus, Download, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CategorySidebar } from "@/components/inventario/category-sidebar";
import { CategoryDialog } from "@/components/inventario/category-dialog";
import { TagDialog } from "@/components/inventario/tag-dialog";
import { getSupplyColumns } from "@/components/inventario/supply-columns";
import { AddSupplyStockDialog } from "@/components/inventario/add-supply-stock-dialog";
import { useSupplies, useSupplyKPIs, useDeleteSupply } from "@/hooks/queries/use-supplies";
import { useCategories, useDeleteCategory, useDeleteTag } from "@/hooks/queries/use-categories";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { exportToExcel } from "@/lib/utils/export-excel";
import { usePermissions } from "@/hooks/use-permissions";
import type { SupplyFilters } from "@/types/supply";

const PAGE_SIZE = 20;

export default function InsumosPage() {
  const router = useRouter();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagCategoryId, setTagCategoryId] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "category" | "tag"; id: string; name: string } | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [stockSupply, setStockSupply] = useState<{ id: string; name: string; unitOfMeasure?: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, selectedCategoryId, selectedTagId, selectedBranchId]);

  const filters = useMemo<SupplyFilters>(
    () => ({
      search: search || undefined,
      category_id: selectedCategoryId || undefined,
      tag_id: selectedTagId || undefined,
      branch_id: selectedBranchId || undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
    }),
    [search, selectedCategoryId, selectedTagId, selectedBranchId, page]
  );

  const { data: supplyData, isLoading, isFetching } = useSupplies(filters);
  const { data: kpis, isLoading: isLoadingKPIs } = useSupplyKPIs();
  const { data: categories, isLoading: isLoadingCategories } = useCategories("supply");
  const { data: branches } = useBranchesForSelect();
  const deleteMutation = useDeleteSupply();
  const deleteCategoryMutation = useDeleteCategory();
  const deleteTagMutation = useDeleteTag();

  const hasEdit = canEdit("inventario.insumos");
  const hasDelete = canDelete("inventario.insumos");
  const hasCreate = canCreate("inventario.insumos");

  const columns = useMemo(
    () =>
      getSupplyColumns({
        onView: (s) => router.push(`/inventario/insumos/${s.id}`),
        onEdit: (s) => router.push(`/inventario/insumos/${s.id}/editar`),
        onDelete: (id) => setDeleteId(id),
        onAddStock: (s) => setStockSupply({ id: s.id, name: s.name, unitOfMeasure: s.unit_of_measure }),
        canEdit: hasEdit,
        canDelete: hasDelete,
      }),
    [router, hasEdit, hasDelete]
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    const result = await deleteMutation.mutateAsync(deleteId);
    if (result.success) {
      toast.success(result.message || "Eliminado exitosamente");
    } else {
      toast.error(typeof result.error === "string" ? result.error : "Error al eliminar");
    }
    setDeleteId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    const result = deleteConfirm.type === "category"
      ? await deleteCategoryMutation.mutateAsync(deleteConfirm.id)
      : await deleteTagMutation.mutateAsync(deleteConfirm.id);
    if (result.success) {
      toast.success(result.message || "Eliminado exitosamente");
    } else {
      toast.error(typeof result.error === "string" ? result.error : "Error");
    }
    setDeleteConfirm(null);
  };

  const handleExport = async () => {
    if (!supplyData?.data?.length) return;
    await exportToExcel({
      filename: `insumos-${new Date().toISOString().split("T")[0]}`,
      sheetName: "Insumos",
      title: "Catalogo de Insumos",
      columns: [
        { header: "SKU", key: "sku", width: 14 },
        { header: "Nombre", key: "name", width: 30 },
        { header: "UdM", key: "unit_of_measure", width: 10 },
        { header: "Stock", key: "stock_quantity", width: 10 },
        { header: "Costo", key: "cost_price", width: 12, format: (v) => v != null ? Number(v).toFixed(2) : "\u2014" },
        { header: "Moneda", key: "currency", width: 8 },
        { header: "POS", key: "available_in_pos", width: 8, format: (v) => v ? "Si" : "No" },
        { header: "Estado", key: "is_active", width: 10, format: (v) => v ? "Activo" : "Inactivo" },
      ],
      data: supplyData.data as unknown as Record<string, unknown>[],
    });
    toast.success("Excel exportado exitosamente");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insumos"
        description="Catalogo de materias primas e insumos"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!supplyData?.data?.length}
            >
              <Download className="mr-2 size-4" />
              Exportar
            </Button>
            {hasCreate && (
              <Button onClick={() => router.push("/inventario/insumos/nuevo")}>
                <Plus className="mr-2 size-4" />
                Nuevo insumo
              </Button>
            )}
          </div>
        }
      />

      {isLoadingKPIs ? (
        <KpiGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </KpiGrid>
      ) : (
        <KpiGrid>
          <KpiCard
            title="Insumos activos"
            value={kpis?.total_supplies ?? 0}
            description="En inventario"
            icon={Warehouse}
            variant="primary"
          />
          <KpiCard
            title="Stock bajo"
            value={kpis?.low_stock_count ?? 0}
            description="Por debajo del minimo"
            icon={AlertTriangle}
            variant="warning"
          />
          <KpiCard
            title="Sin stock"
            value={kpis?.out_of_stock_count ?? 0}
            description="Agotados"
            icon={PackageX}
            variant="danger"
          />
          <KpiCard
            title="Disponibles en POS"
            value={kpis?.pos_enabled_count ?? 0}
            description="Habilitados para venta"
            icon={ShoppingCart}
            variant="default"
          />
        </KpiGrid>
      )}

      {/* Mobile sidebar trigger */}
      <div className="lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>
          <SlidersHorizontal className="mr-2 size-4" />
          Categorias y etiquetas
        </Button>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[300px] overflow-y-auto p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Categorias y etiquetas</SheetTitle>
            <SheetDescription>Filtra insumos por categoria o etiqueta</SheetDescription>
          </SheetHeader>
          <div className="px-2 pb-4">
            <CategorySidebar
              categories={categories || []}
              isLoading={isLoadingCategories}
              selectedCategoryId={selectedCategoryId}
              selectedTagId={selectedTagId}
              onSelectCategory={(id) => { setSelectedCategoryId(id); setSidebarOpen(false); }}
              onSelectTag={(id) => { setSelectedTagId(id); setSidebarOpen(false); }}
              onCreateCategory={() => setCategoryDialogOpen(true)}
              onCreateTag={(catId) => {
                setTagCategoryId(catId);
                setTagDialogOpen(true);
              }}
              onDeleteCategory={(id, name) => setDeleteConfirm({ type: "category", id, name })}
              onDeleteTag={(id, name) => setDeleteConfirm({ type: "tag", id, name })}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex gap-6">
        <div className="hidden w-[260px] shrink-0 lg:block">
          <CategorySidebar
            categories={categories || []}
            isLoading={isLoadingCategories}
            selectedCategoryId={selectedCategoryId}
            selectedTagId={selectedTagId}
            onSelectCategory={setSelectedCategoryId}
            onSelectTag={setSelectedTagId}
            onCreateCategory={() => setCategoryDialogOpen(true)}
            onCreateTag={(catId) => {
              setTagCategoryId(catId);
              setTagDialogOpen(true);
            }}
            onDeleteCategory={(id, name) => setDeleteConfirm({ type: "category", id, name })}
            onDeleteTag={(id, name) => setDeleteConfirm({ type: "tag", id, name })}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              placeholder="Buscar insumos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
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
            data={supplyData?.data ?? []}
            manualPagination
            pageCount={supplyData?.totalPages ?? 0}
            pageIndex={page}
            onPageChange={setPage}
            totalRows={supplyData?.total ?? 0}
            isFetching={isFetching}
            isLoading={isLoading}
            pageSize={PAGE_SIZE}
            emptyMessage="No hay insumos registrados"
            emptyActionLabel="Crear insumo"
            emptyActionHref="/inventario/insumos/nuevo"
          />
        </div>
      </div>

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
      />

      <TagDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        categoryId={tagCategoryId}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Eliminar insumo"
        description="Este insumo se eliminara permanentemente."
        onConfirm={handleDelete}
        variant="danger"
      />

      {stockSupply && (
        <AddSupplyStockDialog
          open={!!stockSupply}
          onOpenChange={(open) => !open && setStockSupply(null)}
          supplyId={stockSupply.id}
          supplyName={stockSupply.name}
          unitOfMeasure={stockSupply.unitOfMeasure}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title={deleteConfirm?.type === "category" ? "Eliminar categoria" : "Eliminar etiqueta"}
        description={
          deleteConfirm?.type === "category"
            ? `Se eliminara la categoria "${deleteConfirm?.name ?? ""}"`
            : `Se eliminara la etiqueta "${deleteConfirm?.name ?? ""}"`
        }
        onConfirm={handleConfirmDelete}
        variant="danger"
      />
    </div>
  );
}
