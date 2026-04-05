"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Warehouse } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAudit } from "@/hooks/queries/use-inventory-audits";

export default function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isLoading } = useAudit(id);
  const audit = data?.audit;
  const auditItems = data?.items || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <p className="text-sm text-muted-foreground">
          Auditoría no encontrada
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.back()}
        >
          Volver
        </Button>
      </div>
    );
  }

  const auditDate = format(new Date(audit.created_at), "dd MMM yyyy", {
    locale: es,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Auditoría #${auditDate}`}
        description={audit.branch_name || ""}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={audit.status} />
            <Button
              variant="outline"
              onClick={() => router.push("/inventario/auditoria")}
            >
              <ArrowLeft className="mr-2 size-4" />
              Volver
            </Button>
          </div>
        }
      />

      {/* Inline KPI stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Items auditados</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            {audit.items_audited}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Ajustados</p>
          <p
            className={cn(
              "text-2xl font-bold tabular-nums",
              audit.items_adjusted > 0
                ? "text-amber-400"
                : "text-muted-foreground"
            )}
          >
            {audit.items_adjusted}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Impacto</p>
          <p
            className={cn(
              "text-2xl font-bold tabular-nums",
              audit.total_discrepancy_value < 0
                ? "text-destructive"
                : audit.total_discrepancy_value > 0
                  ? "text-amber-400"
                  : "text-muted-foreground"
            )}
          >
            {audit.total_discrepancy_value < 0
              ? "-"
              : audit.total_discrepancy_value > 0
                ? "+"
                : ""}
            S/ {Math.abs(audit.total_discrepancy_value).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Items table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">
                Tipo
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                SKU
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Nombre
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Teorico
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Fisico
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Diferencia
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Impacto (S/)
              </th>
            </tr>
          </thead>
          <tbody>
            {auditItems.map((item) => (
              <tr
                key={item.entity_id}
                className="border-b border-border/50 even:bg-muted/5"
              >
                <td className="px-3 py-1.5">
                  {item.entity_type === "product" ? (
                    <Package className="size-4 text-muted-foreground" />
                  ) : (
                    <Warehouse className="size-4 text-muted-foreground" />
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                  {item.entity_sku}
                </td>
                <td className="px-3 py-1.5 font-medium truncate max-w-[200px]">
                  {item.entity_name}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {Number.isInteger(Number(item.theoretical_stock)) ? Number(item.theoretical_stock) : Number(item.theoretical_stock).toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {Number.isInteger(Number(item.physical_stock)) ? Number(item.physical_stock) : Number(item.physical_stock).toFixed(2)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums font-semibold",
                    Number(item.difference) === 0
                      ? "text-muted-foreground"
                      : Number(item.difference) < 0
                        ? "text-destructive"
                        : "text-amber-400"
                  )}
                >
                  {Number(item.difference) > 0
                    ? `+${Number.isInteger(Number(item.difference)) ? Number(item.difference) : Number(item.difference).toFixed(2)}`
                    : (Number.isInteger(Number(item.difference)) ? String(Number(item.difference)) : Number(item.difference).toFixed(2))}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums font-semibold",
                    Number(item.cost_impact) === 0
                      ? "text-muted-foreground"
                      : Number(item.cost_impact) < 0
                        ? "text-destructive"
                        : "text-amber-400"
                  )}
                >
                  {Number(item.cost_impact) === 0
                    ? "\u2014"
                    : `${Number(item.cost_impact) < 0 ? "-" : "+"}S/ ${Math.abs(Number(item.cost_impact)).toFixed(2)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {audit.notes && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Notas</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {audit.notes}
          </p>
        </div>
      )}

      {/* Footer: auditor + date */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Auditado por:{" "}
          <span className="font-medium text-foreground">
            {audit.audited_by_name || "\u2014"}
          </span>
        </span>
        <span>
          {format(new Date(audit.created_at), "dd MMM yyyy, HH:mm", {
            locale: es,
          })}
        </span>
      </div>
    </div>
  );
}
