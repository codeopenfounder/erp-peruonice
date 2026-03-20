"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { useSalesKPIs } from "@/hooks/queries/use-kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

const PAYMENT_CONFIG = [
  { key: "revenue_cash", label: "Efectivo", color: "var(--chart-2)" },
  { key: "revenue_card", label: "Tarjeta", color: "var(--chart-5)" },
  { key: "revenue_transfer", label: "Transferencia", color: "var(--chart-4)" },
  { key: "revenue_credit", label: "Credito", color: "var(--chart-3)" },
  { key: "revenue_mixed", label: "Mixto", color: "var(--chart-1)" },
] as const;

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: { pct: number };
  }>;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium">{item.name}</p>
      <p className="text-sm font-semibold">{formatCurrency(item.value)}</p>
      <p className="text-xs text-muted-foreground">
        {item.payload.pct.toFixed(1)}% del total
      </p>
    </div>
  );
}

function CustomLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>;
}) {
  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2">
      {payload.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function PaymentTypeChart() {
  const { filters } = useDashboardFilters();
  const { data: sales, isLoading, isFetching } = useSalesKPIs(filters);

  const chartData = useMemo(() => {
    if (!sales) return [];

    const total =
      sales.revenue_cash +
      sales.revenue_card +
      sales.revenue_transfer +
      sales.revenue_credit +
      sales.revenue_mixed;

    return PAYMENT_CONFIG.map((cfg) => ({
      name: cfg.label,
      value: sales[cfg.key] as number,
      color: cfg.color,
      pct: total > 0 ? ((sales[cfg.key] as number) / total) * 100 : 0,
    })).filter((d) => d.value > 0);
  }, [sales]);

  return (
    <ChartCard
      title="Metodos de Pago"
      isLoading={isLoading}
      isFetching={isFetching}
      isEmpty={!chartData.length}
    >
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
