"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUpCircle, ArrowDownCircle, RotateCcw, PackagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockMovement } from "@/types/product";

interface StockHistoryProps {
  movements: (StockMovement & { created_by_name?: string | null })[];
}

const typeConfig = {
  initial: {
    label: "Stock inicial",
    icon: PackagePlus,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  add: {
    label: "Ingreso",
    icon: ArrowUpCircle,
    color: "text-success",
    bg: "bg-success/10",
  },
  subtract: {
    label: "Salida",
    icon: ArrowDownCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  adjustment: {
    label: "Ajuste",
    icon: RotateCcw,
    color: "text-warning",
    bg: "bg-warning/10",
  },
};

export function StockHistory({ movements }: StockHistoryProps) {
  if (movements.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No hay movimientos de stock registrados.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {movements.map((m) => {
        const config = typeConfig[m.type] || typeConfig.adjustment;
        const Icon = config.icon;

        return (
          <div
            key={m.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2.5"
          >
            <div
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                config.bg
              )}
            >
              <Icon className={cn("size-4", config.color)} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {config.label}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    m.type === "subtract"
                      ? "text-destructive"
                      : "text-success"
                  )}
                >
                  {m.type === "subtract" ? "-" : "+"}
                  {m.quantity}
                </span>
              </div>

              {m.notes && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.notes}
                </p>
              )}

              {m.invoice_code && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">Factura:</span> {m.invoice_code}
                </p>
              )}
              {m.supplier_ruc && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">RUC Proveedor:</span>{" "}
                  {m.supplier_ruc}
                </p>
              )}

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
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
