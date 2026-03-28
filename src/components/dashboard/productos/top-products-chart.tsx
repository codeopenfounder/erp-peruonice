"use client";

import { useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { ChartExportButton } from "@/components/dashboard/shared/chart-export-button";
import type { ProductRankingItem } from "@/types/kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: ProductRankingItem;
  }>;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium">{item.product_name}</p>
      <p className="text-sm font-semibold">
        {formatCurrency(item.total_revenue)}
      </p>
      <p className="text-xs text-muted-foreground">
        {item.units_sold} uds. · Costo: {formatCurrency(item.cost_price ?? 0)}
      </p>
      <p className="text-xs text-muted-foreground">
        {item.pct_of_total.toFixed(1)}% del total · Margen: {formatCurrency(item.margin ?? 0)}
      </p>
    </div>
  );
}

const TOP_EXPORT_COLS = [
  { header: "Producto", key: "product_name", width: 24 },
  { header: "SKU", key: "product_sku", width: 12 },
  { header: "Uds. Vendidas", key: "units_sold", width: 12, format: (v: unknown) => Number(v || 0).toFixed(0) },
  { header: "Ingresos (S/)", key: "total_revenue", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Costo Unit. (S/)", key: "cost_price", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Margen (S/)", key: "margin", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "% del Total", key: "pct_of_total", width: 10, format: (v: unknown) => Number(v || 0).toFixed(1) + "%" },
];

interface TopProductsChartProps {
  data: ProductRankingItem[];
  isLoading: boolean;
  isFetching: boolean;
  dateRange: { from: string; to: string };
}

export function TopProductsChart({
  data,
  isLoading,
  isFetching,
  dateRange,
}: TopProductsChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartData = data.map((item) => ({
    ...item,
    shortName: truncate(item.product_name, 20),
  }));

  const getData = useCallback(() => chartData as unknown as Record<string, unknown>[], [chartData]);

  return (
    <ChartCard
      title="Top 10 Productos"
      isLoading={isLoading}
      isFetching={isFetching}
      isEmpty={!chartData.length}
      height={400}
      action={
        <ChartExportButton
          chartTitle="Top 10 Productos"
          dateRange={dateRange}
          columns={TOP_EXPORT_COLS}
          getData={getData}
          chartRef={chartRef}
        />
      }
    >
      <div ref={chartRef}>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-muted"
            horizontal={false}
          />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatCurrency(v)}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            type="category"
            dataKey="shortName"
            width={140}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="total_revenue"
            fill="var(--chart-1)"
            radius={[0, 4, 4, 0]}
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
