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
import { format, parseISO } from "date-fns";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { ChartExportButton } from "@/components/dashboard/shared/chart-export-button";
import { useDailyTrend } from "@/hooks/queries/use-kpi";

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
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">
        {format(parseISO(label), "dd/MM/yyyy")}
      </p>
      <p className="text-sm font-semibold">
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  );
}

const TREND_EXPORT_COLS = [
  { header: "Fecha", key: "date", width: 14 },
  { header: "Ingresos (S/)", key: "total_revenue", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Transacciones", key: "transaction_count", width: 14 },
  { header: "Ticket Promedio (S/)", key: "avg_ticket", width: 16, format: (v: unknown) => Number(v || 0).toFixed(2) },
];

export function VentasChart() {
  const { filters } = useDashboardFilters();
  const chartRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isFetching } = useDailyTrend(filters);

  const isSingleDay = filters.date_from === filters.date_to;
  const getData = useCallback(() => (data || []) as unknown as Record<string, unknown>[], [data]);

  return (
    <ChartCard
      title="Tendencia de Ventas"
      isLoading={isLoading}
      isFetching={isFetching}
      isEmpty={!data?.length}
      action={
        !isSingleDay ? (
          <ChartExportButton
            chartTitle="Tendencia de Ventas"
            dateRange={{ from: filters.date_from, to: filters.date_to }}
            columns={TREND_EXPORT_COLS}
            getData={getData}
            chartRef={chartRef}
          />
        ) : undefined
      }
    >
      {isSingleDay ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          Selecciona un rango de fechas para ver la tendencia
        </div>
      ) : (
        <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradientRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => format(parseISO(v), "dd/MM")}
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
            <Area
              type="monotone"
              dataKey="total_revenue"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#gradientRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
