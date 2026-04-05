"use client";

import { useMemo, useRef, useCallback } from "react";
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
import { ChartExportButton } from "@/components/dashboard/shared/chart-export-button";
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
  { key: "revenue_credit", label: "Crédito", color: "var(--chart-3)" },
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

const PAYMENT_EXPORT_COLS = [
  { header: "Método", key: "name", width: 16 },
  { header: "Monto (S/)", key: "value", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "% del Total", key: "pct", width: 12, format: (v: unknown) => Number(v || 0).toFixed(1) + "%" },
];

export function PaymentTypeChart() {
  const { filters } = useDashboardFilters();
  const chartRef = useRef<HTMLDivElement>(null);
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

  const getData = useCallback(() => chartData as unknown as Record<string, unknown>[], [chartData]);

  return (
    <ChartCard
      title="Métodos de Pago"
      isLoading={isLoading}
      isFetching={isFetching}
      isEmpty={!chartData.length}
      action={
        <ChartExportButton
          chartTitle="Métodos de Pago"
          dateRange={{ from: filters.date_from, to: filters.date_to }}
          columns={PAYMENT_EXPORT_COLS}
          getData={getData}
          chartRef={chartRef}
        />
      }
    >
      <div ref={chartRef}>
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
      </div>
    </ChartCard>
  );
}
