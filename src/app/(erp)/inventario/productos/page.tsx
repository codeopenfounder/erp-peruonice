"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, AlertTriangle, PackageX, Layers, Plus, Download, SlidersHorizontal } from "lucide-react";
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
import { getProductColumns } from "@/components/inventario/product-columns";
import { AddStockDialog } from "@/components/inventario/add-stock-dialog";
import { useProducts, useProductKPIs, useDeleteProduct, usePendingProductApprovals } from "@/hooks/queries/use-products";
import { useCategories, useDeleteCategory, useDeleteTag } from "@/hooks/queries/use-categories";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { exportToExcel } from "@/lib/utils/export-excel";
import { usePermissions } from "@/hooks/use-permissions";
import type { ProductFilters } from "@/types/product";

const PAGE_SIZE = 20;

export default function ProductosPage() {
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
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<{ id: string; name: string; unitOfMeasure?: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, selectedCategoryId, selectedTagId, selectedBranchId, selectedKind]);

  const filters = useMemo<ProductFilters>(
    () => ({
      type: "product",
      search: search || undefined,
      product_kind: (selectedKind as "simple" | "composite") || undefined,
      category_id: selectedCategoryId || undefined,
      tag_id: selectedTagId || undefined,
      branch_id: selectedBranchId || undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
    }),
    [search, selectedCategoryId, selectedTagId, selectedBranchId, selectedKind, page]
  );

  const { data: productData, isLoading, isFetching } = useProducts(filters);
  const { data: kpis, isLoading: isLoadingKPIs } = useProductKPIs();
  const { data: categories, isLoading: isLoadingCategories } = useCategories("product");
  const { data: branches } = useBranchesForSelect();
  const { data: pendingApprovals } = usePendingProductApprovals();
  const deleteMutation = useDeleteProduct();
  const deleteCategoryMutation = useDeleteCategory();
  const deleteTagMutation = useDeleteTag();

  const pendingDeleteCatIds = new Set(pendingApprovals?.pendingDeleteCategoryIds ?? []);
  const pendingDeleteTagIds = new Set(pendingApprovals?.pendingDeleteTagIds ?? []);

  const hasEdit = canEdit("inventario.productos");
  const hasDelete = canDelete("inventario.productos");
  const hasCreate = canCreate("inventario.productos");

  const columns = useMemo(
    () =>
      getProductColumns({
        onView: (p) => router.push(`/inventario/productos/${p.id}`),
        onEdit: (p) => router.push(`/inventario/productos/${p.id}/editar`),
        onDelete: (id) => setDeleteId(id),
        onAddStock: (p) => setStockProduct({ id: p.id, name: p.name, unitOfMeasure: p.unit_of_measure }),
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
    if (!productData?.data?.length) return;
    await exportToExcel({
      filename: `productos-${new Date().toISOString().split("T")[0]}`,
      sheetName: "Productos",
      title: "Catalogo de Productos",
      columns: [
        { header: "SKU", key: "sku", width: 14 },
        { header: "Nombre", key: "name", width: 30 },
        { header: "Categorias", key: "categories", width: 20, format: (v) => ((v as { name: string }[])?.map((c) => c.name).join(", ")) || "—" },
        { header: "Precio", key: "unit_price", width: 12, format: (v) => Number(v).toFixed(2) },
        { header: "Costo", key: "cost_price", width: 12, format: (v) => v ? Number(v).toFixed(2) : "—" },
        { header: "Moneda", key: "currency", width: 8 },
        { header: "Stock", key: "stock_quantity", width: 10 },
        { header: "Stock min.", key: "min_stock", width: 12, format: (v) => v != null ? String(v) : "—" },
        { header: "Codigo barras", key: "barcode", width: 16, format: (v) => (v as string) || "—" },
        { header: "Estado", key: "is_active", width: 10, format: (v) => v ? "Activo" : "Inactivo" },
      ],
      data: productData.data as unknown as Record<string, unknown>[],
    });
    toast.success("Excel exportado exitosamente");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description="Catalogo de productos del inventario"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!productData?.data?.length}
            >
              <Download className="mr-2 size-4" />
              Exportar
            </Button>
            {hasCreate && (
              <Button onClick={() => router.push("/inventario/productos/nuevo")}>
                <Plus className="mr-2 size-4" />
                Nuevo producto
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
            title="Productos activos"
            value={kpis?.total_products ?? 0}
            description="En inventario"
            icon={Package}
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
            title="Categorias"
            value={kpis?.total_categories ?? 0}
            description="Categorias activas"
            icon={Layers}
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
            <SheetDescription>Filtra productos por categoria o etiqueta</SheetDescription>
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
              pendingDeleteCategoryIds={pendingDeleteCatIds}
              pendingDeleteTagIds={pendingDeleteTagIds}
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
            pendingDeleteCategoryIds={pendingDeleteCatIds}
            pendingDeleteTagIds={pendingDeleteTagIds}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              placeholder="Buscar productos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={selectedKind ?? "all"}
              onValueChange={(v) => setSelectedKind(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Todos los tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="simple">Simples</SelectItem>
                <SelectItem value="composite">Compuestos</SelectItem>
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
            data={productData?.data ?? []}
            manualPagination
            pageCount={productData?.totalPages ?? 0}
            pageIndex={page}
            onPageChange={setPage}
            totalRows={productData?.total ?? 0}
            isFetching={isFetching}
            isLoading={isLoading}
            pageSize={PAGE_SIZE}
            emptyMessage="No hay productos registrados"
            emptyActionLabel="Crear producto"
            emptyActionHref="/inventario/productos/nuevo"
          />
        </div>
      </div>

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        defaultType="product"
      />

      <TagDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        categoryId={tagCategoryId}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Eliminar producto"
        description="Este producto se eliminara permanentemente."
        onConfirm={handleDelete}
        variant="danger"
      />

      {stockProduct && (
        <AddStockDialog
          open={!!stockProduct}
          onOpenChange={(open) => !open && setStockProduct(null)}
          productId={stockProduct.id}
          productName={stockProduct.name}
          unitOfMeasure={stockProduct.unitOfMeasure}
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
