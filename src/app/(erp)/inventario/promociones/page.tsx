"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Ticket, CalendarClock, CalendarX, BarChart3, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getPromotionColumns } from "@/components/inventario/promotion-columns";
import { usePromotions, usePromotionKPIs, useDeletePromotion } from "@/hooks/queries/use-promotions";
import { usePermissions } from "@/hooks/use-permissions";
import type { PromotionFilters } from "@/types/promotion";

const PAGE_SIZE = 10;

export default function PromocionesPage() {
  const router = useRouter();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Reset page when search changes
  useEffect(() => { setPage(0); }, [search]);

  const filters = useMemo<PromotionFilters>(
    () => ({ search: search || undefined, page: page + 1, page_size: PAGE_SIZE }),
    [search, page]
  );

  const { data: promoData, isLoading, isFetching } = usePromotions(filters);
  const { data: kpis, isLoading: isLoadingKPIs } = usePromotionKPIs();
  const deleteMutation = useDeletePromotion();

  const hasEdit = canEdit("inventario.promociones");
  const hasDelete = canDelete("inventario.promociones");
  const hasCreate = canCreate("inventario.promociones");

  const columns = useMemo(
    () =>
      getPromotionColumns({
        onView: (p) => router.push(`/inventario/promociones/${p.id}`),
        onEdit: (p) => router.push(`/inventario/promociones/${p.id}/editar`),
        onDelete: (id) => setDeleteId(id),
        canEdit: hasEdit,
        canDelete: hasDelete,
      }),
    [router, hasEdit, hasDelete]
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    const result = await deleteMutation.mutateAsync(deleteId);
    if (result.success) {
      const msg = "message" in result && result.message ? (result.message as string) : "Eliminado exitosamente";
      toast.success(msg);
    } else {
      toast.error(typeof result.error === "string" ? result.error : "Error al eliminar");
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promociones"
        description="Gestiona descuentos y promociones del inventario"
        actions={
          hasCreate ? (
            <Button onClick={() => router.push("/inventario/promociones/nueva")}>
              <Plus className="mr-2 size-4" />
              Nueva promocion
            </Button>
          ) : undefined
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
            title="Activas"
            value={kpis?.total_active ?? 0}
            description="Promociones vigentes"
            icon={Ticket}
            variant="success"
          />
          <KpiCard
            title="Programadas"
            value={kpis?.total_scheduled ?? 0}
            description="Por iniciar"
            icon={CalendarClock}
            variant="primary"
          />
          <KpiCard
            title="Expiradas"
            value={kpis?.total_expired ?? 0}
            description="Promociones vencidas"
            icon={CalendarX}
            variant="default"
          />
          <KpiCard
            title="Usos totales"
            value={kpis?.total_uses ?? 0}
            description="Veces utilizadas"
            icon={BarChart3}
            variant="accent"
          />
        </KpiGrid>
      )}

      <div className="mb-4">
        <Input
          placeholder="Buscar promociones..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={promoData?.data ?? []}
        manualPagination
        pageCount={promoData?.totalPages ?? 0}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={promoData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay promociones registradas"
        emptyActionLabel="Crear promoción"
        emptyActionHref="/inventario/promociones/nueva"
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Eliminar promoción"
        description="Esta accion no se puede deshacer."
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
