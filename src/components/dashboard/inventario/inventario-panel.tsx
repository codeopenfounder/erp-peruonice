"use client";

import { ClipboardCheck, Package, AlertTriangle } from "lucide-react";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { useInventoryHealth } from "@/hooks/queries/use-kpi";
import { MetricCard } from "@/components/dashboard/shared/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EficienciaGauge } from "./eficiencia-gauge";
import { MermasChart } from "./mermas-chart";

export function InventarioPanel() {
  const { filters } = useDashboardFilters();
  const { data, isLoading } = useInventoryHealth(filters);

  return (
    <div className="space-y-4">
      {/* Top row: 3 metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {isLoading ? (
          <>
            <Skeleton className="h-[100px] rounded-xl" />
            <Skeleton className="h-[100px] rounded-xl" />
            <Skeleton className="h-[100px] rounded-xl" />
          </>
        ) : (
          <>
            <MetricCard
              title="Auditorias realizadas"
              value={data?.total_audits ?? 0}
              icon={ClipboardCheck}
              variant="default"
            />
            <MetricCard
              title="Items auditados"
              value={data?.items_audited ?? 0}
              icon={Package}
              variant="default"
            />
            <MetricCard
              title="Discrepancias"
              value={data?.items_with_discrepancy ?? 0}
              icon={AlertTriangle}
              variant={
                (data?.items_with_discrepancy ?? 0) > 0 ? "warning" : "default"
              }
            />
          </>
        )}
      </div>

      {/* Bottom row: gauge + bar chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EficienciaGauge data={data} isLoading={isLoading} />
        <MermasChart data={data} isLoading={isLoading} />
      </div>
    </div>
  );
}
