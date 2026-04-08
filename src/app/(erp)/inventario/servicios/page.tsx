"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Layers, Plus, Download, SlidersHorizontal } from "lucide-react";
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
import { PinAuthDialog } from "@/components/ui/pin-auth-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CategorySidebar } from "@/components/inventario/category-sidebar";
import { CategoryDialog } from "@/components/inventario/category-dialog";
import { TagDialog } from "@/components/inventario/tag-dialog";
import { getProductColumns } from "@/components/inventario/product-columns";
import { useProducts, useProductKPIs, useDeleteProduct } from "@/hooks/queries/use-products";
import { useCategories, useDeleteCategory, useDeleteTag } from "@/hooks/queries/use-categories";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { exportToExcel } from "@/lib/utils/export-excel";
import { usePermissions } from "@/hooks/use-permissions";
import type { ProductFilters } from "@/types/product";

const PAGE_SIZE = 20;

export default function ServiciosPage() {
  const router = useRouter();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagCategoryId, setTagCategoryId] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "category" | "tag"; id: string; name: string } | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, selectedCategoryId, selectedTagId, selectedBranchId]);

  const filters = useMemo<ProductFilters>(
    () => ({
      type: "service",
      search: search || undefined,
      category_id: selectedCategoryId || undefined,
      tag_id: selectedTagId || undefined,
      branch_id: selectedBranchId || undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
    }),
    [search, selectedCategoryId, selectedTagId, selectedBranchId, page]
  );

  const { data: serviceData, isLoading, isFetching } = useProducts(filters);
  const { data: kpis, isLoading: isLoadingKPIs } = useProductKPIs();
  const { data: categories, isLoading: isLoadingCategories } = useCategories("service");
  const { data: branches } = useBranchesForSelect();
  const deleteMutation = useDeleteProduct();
  const deleteCategoryMutation = useDeleteCategory();
  const deleteTagMutation = useDeleteTag();

  const hasEdit = canEdit("inventario.servicios");
  const hasDelete = canDelete("inventario.servicios");
  const hasCreate = canCreate("inventario.servicios");

  const columns = useMemo(
    () =>
      getProductColumns(
        {
          onView: (p) => router.push(`/inventario/servicios/${p.id}`),
          onEdit: (p) => router.push(`/inventario/servicios/${p.id}/editar`),
          onDelete: (id, name) => setDeleteTarget({ id, name }),
          canEdit: hasEdit,
          canDelete: hasDelete,
        },
        false
      ),
    [router, hasEdit, hasDelete]
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMutation.mutateAsync(deleteTarget.id);
    if (result.success) {
      toast.success(result.message || "Eliminado exitosamente");
    } else {
      toast.error(typeof result.error === "string" ? result.error : "Error al eliminar");
    }
    setDeleteTarget(null);
  };

  const handlePinAuthorizedDelete = async () => {
    await handleDelete();
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
    if (!serviceData?.data?.length) return;
    await exportToExcel({
      filename: `servicios-${new Date().toISOString().split("T")[0]}`,
      sheetName: "Servicios",
      title: "Catalogo de Servicios",
      columns: [
        { header: "SKU", key: "sku", width: 14 },
        { header: "Nombre", key: "name", width: 30 },
        { header: "Categorías", key: "categories", width: 20, format: (v) => ((v as { name: string }[])?.map((c) => c.name).join(", ")) || "—" },
        { header: "Precio", key: "unit_price", width: 12, format: (v) => Number(v).toFixed(2) },
        { header: "Costo", key: "cost_price", width: 12, format: (v) => v ? Number(v).toFixed(2) : "—" },
        { header: "Moneda", key: "currency", width: 8 },
        { header: "Impuesto", key: "tax_type", width: 12 },
        { header: "Estado", key: "is_active", width: 10, format: (v) => v ? "Activo" : "Inactivo" },
      ],
      data: serviceData.data as unknown as Record<string, unknown>[],
    });
    toast.success("Excel exportado exitosamente");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servicios"
        description="Catalogo de servicios ofrecidos"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!serviceData?.data?.length}
            >
              <Download className="mr-2 size-4" />
              Exportar
            </Button>
            {hasCreate && (
              <Button onClick={() => router.push("/inventario/servicios/nuevo")}>
                <Plus className="mr-2 size-4" />
                Nuevo servicio
              </Button>
            )}
          </div>
        }
      />

      {isLoadingKPIs ? (
        <KpiGrid>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </KpiGrid>
      ) : (
        <KpiGrid>
          <KpiCard
            title="Servicios activos"
            value={kpis?.total_services ?? 0}
            description="Servicios en catalogo"
            icon={Briefcase}
            variant="primary"
          />
          <KpiCard
            title="Categorías"
            value={kpis?.total_categories ?? 0}
            description="Categorías activas"
            icon={Layers}
            variant="default"
          />
        </KpiGrid>
      )}

      {/* Mobile sidebar trigger */}
      <div className="lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>
          <SlidersHorizontal className="mr-2 size-4" />
          Categorías y etiquetas
        </Button>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[300px] overflow-y-auto p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Categorías y etiquetas</SheetTitle>
            <SheetDescription>Filtra servicios por categoría o etiqueta</SheetDescription>
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
              placeholder="Buscar servicios..."
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
            data={serviceData?.data ?? []}
            manualPagination
            pageCount={serviceData?.totalPages ?? 0}
            pageIndex={page}
            onPageChange={setPage}
            totalRows={serviceData?.total ?? 0}
            isFetching={isFetching}
            isLoading={isLoading}
            pageSize={PAGE_SIZE}
            emptyMessage="No hay servicios registrados"
            emptyActionLabel="Crear servicio"
            emptyActionHref="/inventario/servicios/nuevo"
          />
        </div>
      </div>

      <CategoryDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} defaultType="service" />
      <TagDialog open={tagDialogOpen} onOpenChange={setTagDialogOpen} categoryId={tagCategoryId} />

      <PinAuthDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Eliminar servicio"
        description={`"${deleteTarget?.name ?? ""}" sera eliminado del catalogo. No aparecera mas en el sistema POS ni en el ERP. Ingresa el PIN de un gerente para autorizar.`}
        onAuthorized={handlePinAuthorizedDelete}
        isLoading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title={deleteConfirm?.type === "category" ? "Eliminar categoría" : "Eliminar etiqueta"}
        description={
          deleteConfirm?.type === "category"
            ? `Se eliminará la categoría "${deleteConfirm?.name ?? ""}"`
            : `Se eliminará la etiqueta "${deleteConfirm?.name ?? ""}"`
        }
        onConfirm={handleConfirmDelete}
        variant="danger"
      />
    </div>
  );
}
