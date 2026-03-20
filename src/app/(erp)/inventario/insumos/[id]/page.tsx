"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/inventario/stock-badge";
import { EntityMovementTimeline } from "@/components/inventario/entity-movement-timeline";
import { AddSupplyStockDialog } from "@/components/inventario/add-supply-stock-dialog";
import { CURRENCIES, SUNAT_UNITS_OF_MEASURE } from "@/lib/constants/sunat";
import { useSupply } from "@/hooks/queries/use-supplies";
import { usePermissions } from "@/hooks/use-permissions";

export default function SupplyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: supply, isLoading } = useSupply(id);
  const { canEdit } = usePermissions();
  const hasEdit = canEdit("inventario.insumos");
  const [stockDialogOpen, setStockDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!supply) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <p className="text-sm text-muted-foreground">Insumo no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const symbol = CURRENCIES[supply.currency]?.symbol ?? "S/.";
  const uomLabel = SUNAT_UNITS_OF_MEASURE[supply.unit_of_measure as keyof typeof SUNAT_UNITS_OF_MEASURE] ?? supply.unit_of_measure;

  return (
    <div className="space-y-6">
      <PageHeader
        title={supply.name}
        description={`SKU: ${supply.sku}`}
        actions={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => router.push("/inventario/insumos")}>
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Button>
            {hasEdit && (
              <Button onClick={() => router.push(`/inventario/insumos/${id}/editar`)}>
                <Pencil className="mr-2 size-4" />
                Editar
              </Button>
            )}
          </div>
        }
      />

      {/* Supply image */}
      {supply.image_url && (
        <div className="overflow-hidden rounded-xl border border-border">
          <img
            src={supply.image_url}
            alt={supply.name}
            className="w-full max-h-48 sm:max-h-64 object-contain bg-muted/30"
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* General info */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Informacion general</h3>
          <Row label="Nombre" value={supply.name} />
          <Row label="Unidad de medida" value={`${supply.unit_of_measure} - ${uomLabel}`} />
          <Row label="Sede" value={supply.branch_name || "\u2014"} />
          <Row label="Categorias">
            {supply.categories && supply.categories.length > 0 ? (
              <div className="flex flex-wrap gap-1 justify-end">
                {supply.categories.map((cat) => (
                  <span
                    key={cat.id}
                    className="rounded-full bg-secondary/50 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {cat.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Sin categoria</span>
            )}
          </Row>
          <Row label="Descripcion" value={supply.description || "Sin descripcion"} />
          <Row label="Estado">
            <StatusBadge status={supply.is_active ? "active" : "inactive"} />
          </Row>
        </div>

        {/* Price */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Precio</h3>
          <Row label="Costo" value={supply.cost_price != null ? `${symbol} ${supply.cost_price.toFixed(2)}` : "\u2014"} />
          <Row label="Moneda" value={supply.currency} />
        </div>

        {/* Stock card with Add Stock button */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Stock</h3>
            {hasEdit && (
              <Button size="sm" variant="outline" onClick={() => setStockDialogOpen(true)}>
                <Plus className="mr-2 size-4" />
                Anadir stock
              </Button>
            )}
          </div>
          <Row label="Cantidad actual">
            <StockBadge quantity={supply.stock_quantity} minStock={supply.min_stock} type="product" />
          </Row>
          <Row label="Stock minimo" value={supply.min_stock != null ? String(supply.min_stock) : "No definido"} />
          {supply.available_in_pos && (
            <Row label="Disponible en POS">
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary border border-primary/30">
                POS
              </span>
            </Row>
          )}
        </div>

        {/* Tags */}
        {supply.tags.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Etiquetas</h3>
            <div className="flex flex-wrap gap-2">
              {supply.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: tag.color ? `${tag.color}20` : undefined,
                    color: tag.color || undefined,
                    borderColor: tag.color ? `${tag.color}40` : "var(--border)",
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Movement Timeline */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Historial de movimientos</h3>
        <EntityMovementTimeline entityType="supply" entityId={id} />
      </div>

      {/* Add Stock Dialog */}
      <AddSupplyStockDialog
        open={stockDialogOpen}
        onOpenChange={setStockDialogOpen}
        supplyId={supply.id}
        supplyName={supply.name}
        unitOfMeasure={supply.unit_of_measure}
      />
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="text-right font-medium text-foreground">
        {children ?? value}
      </div>
    </div>
  );
}
