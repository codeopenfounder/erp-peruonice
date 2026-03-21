"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { EmptyChartState } from "@/components/dashboard/shared/empty-chart-state";
import type { InventoryHealth } from "@/types/kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

interface MermasChartProps {
  data: InventoryHealth | undefined;
  isLoading: boolean;
}

const BAR_COLORS = [
  "var(--chart-3)", // amber - Mermas
  "var(--chart-1)", // red - Perdidas
  "var(--chart-4)", // purple - Rotura
  "var(--chart-5)", // blue - Consumo Staff
];

export function MermasChart({ data, isLoading }: MermasChartProps) {
  const chartData = [
    { category: "Mermas", value: data?.waste_value ?? 0 },
    { category: "Perdidas", value: data?.shrinkage_value ?? 0 },
    { category: "Rotura", value: data?.breakage_value ?? 0 },
    { category: "Consumo Staff", value: data?.staff_consumption_value ?? 0 },
  ];

  const allZero = chartData.every((d) => d.value === 0);

  return (
    <ChartCard title="Impacto de Perdidas" isLoading={isLoading}>
      {allZero ? (
        <EmptyChartState message="Sin perdidas registradas en el periodo" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--border)"
            />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatCurrency(v)}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="category"
              tick={{ fontSize: 13, fill: "var(--foreground)" }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(value as number), "Valor"]}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: "13px",
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={BAR_COLORS[index]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
