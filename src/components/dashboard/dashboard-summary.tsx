"use client";

import {
  DollarSign,
  Receipt,
  TrendingUp,
  Banknote,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { MetricCard } from "./shared/metric-card";
import { useDashboardFilters } from "./dashboard-filters-provider";
import { useSalesKPIs, useExpensesSummary } from "@/hooks/queries/use-kpi";

const fmt = (v: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(v);

export function DashboardSummary() {
  const { filters } = useDashboardFilters();
  const { data: sales, isLoading: loadingSales } = useSalesKPIs(filters);
  const { data: expenses, isLoading: loadingExpenses } = useExpensesSummary();

  const isLoading = loadingSales || loadingExpenses;

  if (isLoading) {
    return (
      <KpiGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px] rounded-xl" />
        ))}
      </KpiGrid>
    );
  }

  return (
    <KpiGrid>
      <MetricCard
        title="Ventas Totales"
        value={fmt(sales?.total_revenue ?? 0)}
        icon={DollarSign}
        variant="primary"
        currentValue={sales?.total_revenue}
        prevValue={sales?.prev_total_revenue}
        description="Ingresos del periodo"
      />
      <MetricCard
        title="Transacciones"
        value={sales?.transaction_count ?? 0}
        icon={Receipt}
        variant="accent"
        currentValue={sales?.transaction_count}
        prevValue={sales?.prev_transaction_count}
        description="Comprobantes emitidos"
      />
      <MetricCard
        title="Ticket Promedio"
        value={fmt(sales?.avg_ticket ?? 0)}
        icon={TrendingUp}
        variant="success"
        currentValue={sales?.avg_ticket}
        prevValue={sales?.prev_avg_ticket}
        description="Gasto promedio por cliente"
      />
      <MetricCard
        title="Gastos del Periodo"
        value={fmt(expenses?.total_expense_amount ?? 0)}
        icon={Banknote}
        variant="danger"
        currentValue={expenses?.total_expense_amount}
        prevValue={expenses?.prev_expense_amount}
        description="Egresos totales"
      />
    </KpiGrid>
  );
}
