"use client";

import { useRef, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Banknote, TrendingDown, Receipt, Landmark } from "lucide-react";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { MetricCard } from "@/components/dashboard/shared/metric-card";
import { ChartExportButton } from "@/components/dashboard/shared/chart-export-button";
import { useExpensesSummary, useExpensesTrend } from "@/hooks/queries/use-kpi";
import { Skeleton } from "@/components/ui/skeleton";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

function ExpenseTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

const TREND_EXPORT_COLUMNS = [
  { header: "Fecha", key: "date", width: 14 },
  { header: "Monto (S/)", key: "total_amount", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Movimientos", key: "movement_count", width: 12 },
];

export function GastosPanel() {
  const { filters } = useDashboardFilters();
  const chartRef = useRef<HTMLDivElement>(null);
  const { data: summary, isLoading: summaryLoading } = useExpensesSummary();
  const { data: trend, isLoading: trendLoading, isFetching } = useExpensesTrend();

  const chartData = (trend || []).map((point) => ({
    date: new Date(point.expense_date + "T12:00:00").toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
    }),
    total_amount: point.total_amount,
    movement_count: point.movement_count,
  }));

  const getChartData = useCallback(() => chartData as unknown as Record<string, unknown>[], [chartData]);

  const isRange = filters.date_from !== filters.date_to;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))
        ) : (
          <>
            <MetricCard
              title="Total Gastos"
              value={formatCurrency(summary?.total_expense_amount ?? 0)}
              icon={Banknote}
              variant="danger"
              prevValue={summary?.prev_expense_amount}
              currentValue={summary?.total_expense_amount}
              description="vs. periodo anterior"
            />
            <MetricCard
              title="N° Movimientos"
              value={summary?.expense_count ?? 0}
              icon={Receipt}
              variant="default"
              prevValue={summary?.prev_expense_count}
              currentValue={summary?.expense_count}
              description="egresos registrados"
            />
            <MetricCard
              title="Promedio por Gasto"
              value={
                summary && summary.expense_count > 0
                  ? formatCurrency(summary.total_expense_amount / summary.expense_count)
                  : "S/ 0"
              }
              icon={TrendingDown}
              variant="default"
              description="monto promedio"
            />
            <MetricCard
              title="Gasto Diario Prom."
              value={
                isRange && chartData.length > 0
                  ? formatCurrency((summary?.total_expense_amount ?? 0) / chartData.length)
                  : formatCurrency(summary?.total_expense_amount ?? 0)
              }
              icon={Landmark}
              variant="default"
              description="promedio por dia"
            />
          </>
        )}
      </div>

      {/* Trend Chart */}
      {isRange && (
        <ChartCard
          title="Tendencia de Gastos"
          isLoading={trendLoading}
          isFetching={isFetching}
          isEmpty={!chartData.length}
          action={
            <ChartExportButton
              chartTitle="Tendencia de Gastos"
              dateRange={{ from: filters.date_from, to: filters.date_to }}
              columns={TREND_EXPORT_COLUMNS}
              getData={getChartData}
              chartRef={chartRef}
            />
          }
        >
          <div ref={chartRef}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={60}
                  className="text-muted-foreground"
                  tickFormatter={(v) => `S/${v}`}
                />
                <Tooltip content={<ExpenseTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total_amount"
                  stroke="var(--chart-1)"
                  fill="url(#expenseGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
