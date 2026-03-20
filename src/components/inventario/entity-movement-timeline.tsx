"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  ShoppingCart,
  Trash2,
  Search,
  User,
  Zap,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useEntityMovements } from "@/hooks/queries/use-inventory-movements";

// ---------------------------------------------------------------------------
// Movement type configuration
// ---------------------------------------------------------------------------

const MOVEMENT_CONFIG: Record<
  string,
  { label: string; icon: LucideIcon; color: string; bg: string; sign: "+" | "-" }
> = {
  income: { label: "Ingreso", icon: ArrowUpCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", sign: "+" },
  sale: { label: "Venta", icon: ShoppingCart, color: "text-blue-400", bg: "bg-blue-500/10", sign: "-" },
  waste: { label: "Merma", icon: Trash2, color: "text-red-400", bg: "bg-red-500/10", sign: "-" },
  shrinkage: { label: "Perdida", icon: Search, color: "text-orange-400", bg: "bg-orange-500/10", sign: "-" },
  staff_consumption: { label: "Consumo", icon: User, color: "text-sky-400", bg: "bg-sky-500/10", sign: "-" },
  breakage: { label: "Rotura", icon: Zap, color: "text-amber-400", bg: "bg-amber-500/10", sign: "-" },
  adjustment: { label: "Ajuste", icon: BarChart3, color: "text-gray-400", bg: "bg-gray-500/10", sign: "+" },
  transfer: { label: "Transferencia", icon: ArrowLeftRight, color: "text-violet-400", bg: "bg-violet-500/10", sign: "-" },
  outcome: { label: "Egreso", icon: ArrowDownCircle, color: "text-red-400", bg: "bg-red-500/10", sign: "-" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EntityMovementTimelineProps {
  entityType: "product" | "supply";
  entityId: string;
}

export function EntityMovementTimeline({ entityType, entityId }: EntityMovementTimelineProps) {
  const { data: movements, isLoading } = useEntityMovements(entityType, entityId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
            <Skeleton className="mt-0.5 size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!movements || movements.length === 0) {
    const entityLabel = entityType === "product" ? "producto" : "insumo";
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No hay movimientos registrados para este {entityLabel}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {movements.map((m, index) => {
        const config = MOVEMENT_CONFIG[m.movement_type] ?? MOVEMENT_CONFIG.adjustment;
        const Icon = config.icon;

        return (
          <div
            key={m.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2.5"
            style={{
              animation: "fadeSlideIn 0.3s ease forwards",
              animationDelay: `${index * 50}ms`,
              opacity: 0,
            }}
          >
            {/* Icon */}
            <div
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                config.bg,
              )}
            >
              <Icon className={cn("size-4", config.color)} />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              {/* Label + quantity badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {config.label}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    config.sign === "-" ? "text-destructive" : "text-success",
                  )}
                >
                  {config.sign}{m.quantity}
                </span>
              </div>

              {/* Metadata lines */}
              {m.supplier_ruc && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">RUC:</span> {m.supplier_ruc}
                </p>
              )}
              {m.invoice_code && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">Factura:</span> {m.invoice_code}
                </p>
              )}
              {m.invoice_number && m.movement_type === "sale" && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">Comprobante:</span> {m.invoice_number}
                </p>
              )}
              {m.reason && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.reason}
                </p>
              )}

              {/* Date + creator + branch */}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>
                  {format(new Date(m.created_at), "dd MMM yyyy, HH:mm", {
                    locale: es,
                  })}
                </span>
                {m.created_by_name && (
                  <>
                    <span>&middot;</span>
                    <span>{m.created_by_name}</span>
                  </>
                )}
                {m.branch_name && (
                  <>
                    <span>&middot;</span>
                    <span>{m.branch_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* "Ver todos" link */}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/inventario/movimientos?entity_type=${entityType}&entity_id=${entityId}`}>
            Ver todos
          </Link>
        </Button>
      </div>

      {/* Inline keyframes for staggered animation */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
