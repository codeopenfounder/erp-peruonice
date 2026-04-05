"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Info,
  Clock,
  MapPin,
  FolderOpen,
  Tag,
  Settings2,
  Percent,
  BadgeDollarSign,
  Package,
} from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PromotionStatusBadge } from "@/components/inventario/promotion-status-badge";
import { usePromotion } from "@/hooks/queries/use-promotions";
import type { PromotionStatus } from "@/types/promotion";

function computeStatus(p: {
  is_active: boolean;
  stock: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
}): PromotionStatus {
  if (!p.is_active) return "inactive";
  if (p.stock !== null && p.used_count >= p.stock) return "depleted";
  const now = new Date();
  if (p.valid_from && new Date(p.valid_from) > now) return "scheduled";
  if (p.valid_until && new Date(p.valid_until) < now) return "expired";
  return "active";
}

export default function PromotionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: promo, isLoading } = usePromotion(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!promo) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <p className="text-sm text-muted-foreground">
          Promoción no encontrada
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const status = computeStatus(promo);

  return (
    <div className="space-y-6">
      <PageHeader
        title={promo.name}
        description={`Código: ${promo.code}`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/inventario/promociones")}
            >
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Button>
            <Button
              onClick={() =>
                router.push(`/inventario/promociones/${id}/editar`)
              }
            >
              <Pencil className="mr-2 size-4" />
              Editar
            </Button>
          </div>
        }
      />


      <div className="grid gap-5 md:grid-cols-2">
        {/* Info general */}
        <Card>
          <CardHeader icon={<Info className="size-4" />} title="Información general" />
          <Row label="Estado">
            <PromotionStatusBadge status={status} />
          </Row>
          {promo.is_combo ? (
            <>
              <Row label="Tipo" value="Combo" icon={<Package className="size-3.5 text-primary/60" />} highlight />
              <Row label="Precio combo" value={`S/. ${(Number(promo.combo_price) || 0).toFixed(2)}`} highlight />
            </>
          ) : (
            <>
              <Row
                label="Tipo"
                value={promo.discount_type === "percentage" ? "Porcentaje" : "Monto fijo"}
                icon={promo.discount_type === "percentage" ? <Percent className="size-3.5 text-primary/60" /> : <BadgeDollarSign className="size-3.5 text-primary/60" />}
              />
              <Row
                label="Valor"
                value={promo.discount_type === "percentage" ? `${promo.discount_value}%` : `S/. ${promo.discount_value.toFixed(2)}`}
                highlight
              />
              <Row
                label="Aplica a"
                value={promo.applies_to === "all" ? "Productos y servicios" : promo.applies_to === "products" ? "Solo productos" : "Solo servicios"}
              />
            </>
          )}
          {promo.description && (
            <Row label="Descripción" value={promo.description} />
          )}
        </Card>

        {/* Productos del combo */}
        {promo.is_combo && promo.combo_items?.length > 0 && (
          <Card>
            <CardHeader icon={<Package className="size-4" />} title="Productos del combo" />
            {promo.combo_items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{item.product_name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{item.product_sku}</span>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className="text-muted-foreground">{item.quantity}x</span>
                  <span className="font-medium font-mono">S/. {((item.product_price ?? 0) * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
            <div className="border-t border-border/50 pt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total regular</span>
              <span className="font-mono line-through text-muted-foreground">
                S/. {promo.combo_items.reduce((s, i) => s + (i.product_price ?? 0) * i.quantity, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-primary">Precio combo</span>
              <span className="font-mono font-bold text-primary">S/. {(Number(promo.combo_price) || 0).toFixed(2)}</span>
            </div>
          </Card>
        )}

        {/* Requisitos y uso */}
        <Card>
          <CardHeader icon={<Settings2 className="size-4" />} title="Requisitos y uso" />
          <Row
            label="Compra mínima"
            value={
              promo.min_purchase_amount
                ? `S/. ${promo.min_purchase_amount.toFixed(2)}`
                : "Sin mínimo"
            }
          />
          <Row
            label="Descuento máximo"
            value={
              promo.max_discount_amount
                ? `S/. ${promo.max_discount_amount.toFixed(2)}`
                : "Sin máximo"
            }
          />
          <Row
            label="Stock"
            value={
              promo.stock !== null
                ? `${promo.used_count} / ${promo.stock}`
                : `${promo.used_count} usos (ilimitado)`
            }
          />
          <Row
            label="Max por cliente"
            value={
              promo.max_uses_per_customer !== null
                ? String(promo.max_uses_per_customer)
                : "Ilimitado"
            }
          />
          {promo.min_quantity != null && promo.min_quantity > 0 && (
            <Row
              label="Cantidad minima"
              value={String(promo.min_quantity)}
            />
          )}
          {promo.applies_every > 0 && (
            <Row
              label="Aplica cada"
              value={`Cada ${promo.applies_every} unidades`}
              highlight
            />
          )}
        </Card>

        {/* Vigencia */}
        <Card>
          <CardHeader icon={<Clock className="size-4" />} title="Vigencia" />
          <Row
            label="Desde"
            value={
              promo.valid_from
                ? format(new Date(promo.valid_from), "dd/MM/yyyy HH:mm")
                : "Sin fecha inicio"
            }
          />
          <Row
            label="Hasta"
            value={
              promo.valid_until
                ? format(new Date(promo.valid_until), "dd/MM/yyyy HH:mm")
                : "Sin fecha fin"
            }
          />
          <Row
            label="Hora inicio"
            value={promo.restricted_hour_from || "Sin restriccion"}
          />
          <Row
            label="Hora fin"
            value={promo.restricted_hour_until || "Sin restriccion"}
          />
          {!promo.valid_from && !promo.valid_until && (
            <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-1.5">
              <Info className="size-3.5 text-primary/60" />
              <span className="text-xs text-primary/70">Sin vencimiento</span>
            </div>
          )}
        </Card>

        {/* Sedes */}
        {promo.branch_filters.length > 0 && (
          <Card>
            <CardHeader icon={<MapPin className="size-4" />} title="Sedes" />
            <div className="flex flex-wrap gap-2">
              {promo.branch_filters.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <MapPin className="size-3" />
                  {f.branch_name}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Categorías y etiquetas — hidden for combos */}
        {!promo.is_combo && (promo.category_filters.length > 0 ||
          promo.tag_filters.length > 0) && (
          <Card className="md:col-span-2">
            <CardHeader icon={<FolderOpen className="size-4" />} title="Categorías y etiquetas" />
            {promo.category_filters.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                  Categorías
                </p>
                <div className="flex flex-wrap gap-2">
                  {promo.category_filters.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                    >
                      <FolderOpen className="size-3 text-muted-foreground" />
                      {f.category_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {promo.tag_filters.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                  Etiquetas
                </p>
                <div className="flex flex-wrap gap-2">
                  {promo.tag_filters.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Tag className="size-3" />
                      {f.tag_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-5 space-y-3.5 transition-[border-color,box-shadow] duration-300 hover:border-primary/20 hover:shadow-[0_0_20px_-8px_rgba(0,217,245,0.1)] ${className}`}
    >
      {children}
    </div>
  );
}

function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-1 border-b border-border/50 mb-1">
      <span className="text-primary/70">{icon}</span>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
    </div>
  );
}

function Row({
  label,
  value,
  children,
  icon,
  highlight,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {children ?? (
        <span
          className={`flex items-center gap-1.5 font-medium text-right truncate ${
            highlight ? "text-primary" : "text-foreground"
          }`}
        >
          {icon}
          {value}
        </span>
      )}
    </div>
  );
}
