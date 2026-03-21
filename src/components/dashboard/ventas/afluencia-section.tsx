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
import { Users, Clock } from "lucide-react";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { MetricCard } from "@/components/dashboard/shared/metric-card";
import { useAttendance, useHourlyAttendance } from "@/hooks/queries/use-kpi";

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: { entries: number; scan_count: number; occupancy_pct: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{item.entries} entradas</p>
      <p className="text-xs text-muted-foreground">
        {item.scan_count} escaneos
      </p>
      {item.occupancy_pct > 0 && (
        <p className="text-xs text-muted-foreground">
          {item.occupancy_pct}% ocupacion
        </p>
      )}
    </div>
  );
}

export function AfluenciaSection() {
  const { filters } = useDashboardFilters();
  const { data: attendance, isLoading: attLoading } = useAttendance(filters);
  const { data: hourly, isLoading: hourlyLoading, isFetching } = useHourlyAttendance(filters);

  const chartData = (hourly || []).map((point) => ({
    ...point,
    label: `${point.hour_of_day}h`,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          title="Asistentes"
          value={attendance?.total_entries ?? 0}
          icon={Users}
          variant="accent"
          prevValue={attendance?.prev_total_entries}
          currentValue={attendance?.total_entries}
          description="vs. periodo anterior"
        />
        <MetricCard
          title="Tiempo Promedio"
          value={`${attendance?.avg_dwell_minutes ?? 0} min`}
          icon={Clock}
          variant="default"
          description={`${attendance?.active_sessions ?? 0} sesiones activas`}
        />
      </div>

      <ChartCard
        title="Afluencia por Hora"
        isLoading={attLoading || hourlyLoading}
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
              tick={{ fontSize: 12 }}
              width={40}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="entries"
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
