"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { useHourlySales } from "@/hooks/queries/use-kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: { revenue: number; tx_count: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{formatCurrency(item.revenue)}</p>
      <p className="text-xs text-muted-foreground">
        {item.tx_count} transacciones
      </p>
    </div>
  );
}

export function HourlyChart() {
  const { filters } = useDashboardFilters();
  const { data, isLoading, isFetching } = useHourlySales(filters);

  const chartData = (data || []).map((point) => ({
    ...point,
    label: `${point.hour_of_day}h`,
  }));

  return (
    <ChartCard
      title="Ventas por Hora"
      isLoading={isLoading}
      isFetching={isFetching}
      isEmpty={!chartData.length}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v)}
            tick={{ fontSize: 12 }}
            width={80}
            className="text-muted-foreground"
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="revenue"
            fill="var(--chart-5)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
