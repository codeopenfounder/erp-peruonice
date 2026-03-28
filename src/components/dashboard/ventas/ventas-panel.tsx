"use client";

import { DollarSign } from "lucide-react";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { MetricCard } from "@/components/dashboard/shared/metric-card";
import { useSalesKPIs } from "@/hooks/queries/use-kpi";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionsCard } from "./transactions-card";
import { VentasChart } from "./ventas-chart";
import { HourlyChart } from "./hourly-chart";
import { PaymentTypeChart } from "./payment-type-chart";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

export function VentasPanel() {
  const { filters } = useDashboardFilters();
  const { data: sales, isLoading } = useSalesKPIs(filters);

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))
        ) : (
          <>
            <MetricCard
              title="Ventas Totales"
              value={formatCurrency(sales?.total_revenue ?? 0)}
              icon={DollarSign}
              variant="primary"
              prevValue={sales?.prev_total_revenue}
              currentValue={sales?.total_revenue}
              description="vs. periodo anterior"
            />
            <TransactionsCard data={sales} isLoading={isLoading} />
          </>
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <VentasChart />
        <HourlyChart />
      </div>

      {/* Charts Row 2 */}
      <PaymentTypeChart />
    </div>
  );
}
