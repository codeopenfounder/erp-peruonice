"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StockBadge } from "@/components/inventario/stock-badge";
import { BarcodeDisplay } from "@/components/inventario/barcode-display";
import { AddStockDialog } from "@/components/inventario/add-stock-dialog";
import { EntityMovementTimeline } from "@/components/inventario/entity-movement-timeline";
import { CURRENCIES, SUNAT_UNITS_OF_MEASURE } from "@/lib/constants/sunat";
import { useProduct } from "@/hooks/queries/use-products";
import { usePermissions } from "@/hooks/use-permissions";

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const { canEdit } = usePermissions();
  const hasEdit = canEdit("inventario.productos");
  const [stockDialogOpen, setStockDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <p className="text-sm text-muted-foreground">Producto no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const symbol = CURRENCIES[product.currency]?.symbol ?? "S/.";
  const uomLabel = SUNAT_UNITS_OF_MEASURE[product.unit_of_measure as keyof typeof SUNAT_UNITS_OF_MEASURE] ?? product.unit_of_measure;
  const isService = product.type === "service";
  const backHref = isService ? "/inventario/servicios" : "/inventario/productos";

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={`SKU: ${product.sku}`}
        actions={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => router.push(backHref)}>
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Button>
            {hasEdit && (
              <Button onClick={() => router.push(`${backHref}/${id}/editar`)}>
                <Pencil className="mr-2 size-4" />
                Editar
              </Button>
            )}
          </div>
        }
      />

      {/* Product image */}
      {product.image_url && (
        <div className="overflow-hidden rounded-xl border border-border">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full max-h-48 sm:max-h-64 object-contain bg-muted/30"
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Informacion general</h3>
          <Row label="Tipo" value={isService ? "Servicio" : "Producto"} />
          <Row label="Sede" value={product.branch_name || "—"} />
          <Row label="Categorias">
            {product.categories && product.categories.length > 0 ? (
              <div className="flex flex-wrap gap-1 justify-end">
                {product.categories.map((cat) => (
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
          <Row label="Descripcion" value={product.description || "Sin descripcion"} />
          <Row label="Estado">
            <StatusBadge status={product.is_active ? "active" : "inactive"} />
          </Row>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Precios e impuestos</h3>
          <Row label="Precio unitario" value={`${symbol} ${product.unit_price.toFixed(2)}`} />
          <Row label="Costo" value={product.cost_price ? `${symbol} ${product.cost_price.toFixed(2)}` : "-"} />
          <Row label="Moneda" value={product.currency} />
          <Row label="Tipo de impuesto" value={product.tax_type} />
          {product.tax_type === "gravado" && <Row label="IGV" value={`${product.igv_rate}%`} />}
          <Row label="Unidad de medida" value={`${product.unit_of_measure} - ${uomLabel}`} />
        </div>

        {/* Barcode - products only */}
        {!isService && product.barcode && (
          <BarcodeDisplay value={product.barcode} label="Codigo de barras (EAN-13)" />
        )}

        {/* Stock card with Add Stock button */}
        {!isService && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Stock</h3>
              {hasEdit && product.product_kind !== "composite" && (
                <Button size="sm" variant="outline" onClick={() => setStockDialogOpen(true)}>
                  <Plus className="mr-2 size-4" />
                  Anadir stock
                </Button>
              )}
            </div>
            <Row label="Cantidad actual">
              <StockBadge quantity={product.stock_quantity} minStock={product.min_stock} type="product" />
            </Row>
            <Row label="Stock minimo" value={product.min_stock != null ? String(product.min_stock) : "No definido"} />
          </div>
        )}

        {product.tags.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Etiquetas</h3>
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag) => (
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

      {/* Movement Timeline — only for simple products */}
      {!isService && product.product_kind !== "composite" && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-foreground">Historial de movimientos</h3>
          <EntityMovementTimeline entityType="product" entityId={id} />
        </div>
      )}
      {/* Composite products: stock is calculated from recipe */}
      {!isService && product.product_kind === "composite" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            El stock de este producto compuesto se calcula automaticamente a partir de los insumos de su receta.
          </p>
        </div>
      )}

      {/* Add Stock Dialog */}
      {!isService && (
        <AddStockDialog
          open={stockDialogOpen}
          onOpenChange={setStockDialogOpen}
          productId={product.id}
          productName={product.name}
          unitOfMeasure={product.unit_of_measure}
        />
      )}
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
