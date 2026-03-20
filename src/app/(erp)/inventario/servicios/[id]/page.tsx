"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CURRENCIES } from "@/lib/constants/sunat";
import { useProduct } from "@/hooks/queries/use-products";
import { usePermissions } from "@/hooks/use-permissions";

export default function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const { canEdit } = usePermissions();
  const hasEdit = canEdit("inventario.servicios");

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
        <p className="text-sm text-muted-foreground">Servicio no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const symbol = CURRENCIES[product.currency]?.symbol ?? "S/.";

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={`SKU: ${product.sku}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/inventario/servicios")}>
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Button>
            {hasEdit && (
              <Button onClick={() => router.push(`/inventario/servicios/${id}/editar`)}>
                <Pencil className="mr-2 size-4" />
                Editar
              </Button>
            )}
          </div>
        }
      />

      {/* Service image */}
      {product.image_url && (
        <div className="overflow-hidden rounded-xl border border-border">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full max-h-64 object-contain bg-muted/30"
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Informacion general</h3>
          <Row label="Tipo" value="Servicio" />
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
        </div>

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
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children ?? <span className="font-medium text-foreground">{value}</span>}
    </div>
  );
}
