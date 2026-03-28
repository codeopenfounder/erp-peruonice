"use client";

import { useState, useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Package } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { ChartExportButton } from "@/components/dashboard/shared/chart-export-button";
import { useProductRanking, useHourlyProductSales } from "@/hooks/queries/use-kpi";
import type { ProductRankingItem } from "@/types/kpi";

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: { quantity_sold: number; revenue: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{item.quantity_sold} unidades</p>
      <p className="text-xs text-muted-foreground">
        S/ {item.revenue.toFixed(2)}
      </p>
    </div>
  );
}

const EXPORT_COLS = [
  { header: "Hora", key: "label", width: 8 },
  { header: "Uds. Vendidas", key: "quantity_sold", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Ingresos (S/)", key: "revenue", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
];

interface ProductHourlyChartProps {
  dateRange: { from: string; to: string };
}

export function ProductHourlyChart({ dateRange }: ProductHourlyChartProps) {
  const { filters } = useDashboardFilters();
  const chartRef = useRef<HTMLDivElement>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const { data: ranking, isLoading: rankingLoading } = useProductRanking(filters);
  const { data: hourlyData, isLoading: hourlyLoading, isFetching } = useHourlyProductSales(selectedProductId);

  // Combine top + flop for the full product list, deduplicate, filter empty IDs
  const allProducts: ProductRankingItem[] = [];
  const seen = new Set<string>();
  for (const p of [...(ranking?.top ?? []), ...(ranking?.flop ?? [])]) {
    if (p.product_id && !seen.has(p.product_id)) {
      seen.add(p.product_id);
      allProducts.push(p);
    }
  }

  const isRange = filters.date_from !== filters.date_to;
  const selectedName = allProducts.find((p) => p.product_id === selectedProductId)?.product_name ?? "";

  const chartData = (hourlyData || []).map((point) => ({
    ...point,
    label: `${point.hour_of_day}h`,
  }));

  const getData = useCallback(() => chartData as unknown as Record<string, unknown>[], [chartData]);

  return (
    <ChartCard
      title={
        selectedProductId
          ? `${isRange ? "Promedio" : "Ventas"} por Hora — ${selectedName}`
          : "Ventas por Hora de Producto"
      }
      isLoading={rankingLoading}
      isFetching={isFetching}
      isEmpty={selectedProductId ? !chartData.length : false}
      action={
        selectedProductId && chartData.length > 0 ? (
          <ChartExportButton
            chartTitle={`Ventas por Hora - ${selectedName}`}
            dateRange={dateRange}
            columns={EXPORT_COLS}
            getData={getData}
            chartRef={chartRef}
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Product selector */}
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <Select
            value={selectedProductId ?? ""}
            onValueChange={(v) => setSelectedProductId(v || null)}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Selecciona un producto..." />
            </SelectTrigger>
            <SelectContent>
              {allProducts.map((p) => (
                <SelectItem key={p.product_id} value={p.product_id}>
                  {p.product_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Chart or placeholder */}
        {!selectedProductId ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            Selecciona un producto para ver su distribucion horaria
          </div>
        ) : hourlyLoading ? (
          <div className="flex h-[250px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            Sin ventas en el periodo seleccionado
          </div>
        ) : (
          <div ref={chartRef}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={40}
                  className="text-muted-foreground"
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="quantity_sold"
                  fill="var(--chart-3)"
                  radius={[4, 4, 0, 0]}
                  animationDuration={600}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
