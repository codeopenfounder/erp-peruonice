"use client";

import { useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Ticket, Users, UserX, Clock } from "lucide-react";
import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { MetricCard } from "@/components/dashboard/shared/metric-card";
import { ChartExportButton } from "@/components/dashboard/shared/chart-export-button";
import { useAttendance, useHourlyAttendance } from "@/hooks/queries/use-kpi";

function ComparisonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    payload: {
      entries_sold: number;
      entries: number;
      difference: number;
      conversion: number;
    };
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 space-y-0.5">
        <p className="text-sm">
          <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ backgroundColor: "var(--chart-5)" }} />
          Vendidas: <span className="font-semibold">{item.entries_sold}</span>
        </p>
        <p className="text-sm">
          <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ backgroundColor: "var(--chart-2)" }} />
          Asistencia: <span className="font-semibold">{item.entries}</span>
        </p>
        {item.entries_sold > 0 && (
          <>
            <div className="my-1 border-t border-border" />
            <p className="text-xs text-muted-foreground">
              No asistieron: {item.difference} ({item.conversion}% conversion)
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const EXPORT_COLUMNS = [
  { header: "Hora", key: "label", width: 8 },
  { header: "Vendidas", key: "entries_sold", width: 12 },
  { header: "Asistencia", key: "entries", width: 12 },
  { header: "Diferencia", key: "difference", width: 12 },
  { header: "Conversion %", key: "conversion", width: 12 },
];

export function AsistenciaPanel() {
  const { filters } = useDashboardFilters();
  const chartRef = useRef<HTMLDivElement>(null);
  const { data: attendance, isLoading: attLoading } = useAttendance(filters);
  const { data: hourly, isLoading: hourlyLoading, isFetching } = useHourlyAttendance(filters);

  const chartData = (hourly || []).map((point) => ({
    label: `${point.hour_of_day}h`,
    entries_sold: point.entries_sold,
    entries: point.entries,
    difference: point.entries_sold - point.entries,
    conversion: point.entries_sold > 0 ? Math.round((point.entries / point.entries_sold) * 100) : 0,
  }));

  const getChartData = useCallback(() => chartData as unknown as Record<string, unknown>[], [chartData]);

  const noShowCount = (attendance?.entries_sold ?? 0) - (attendance?.total_entries ?? 0);
  const hasData = (attendance?.entries_sold ?? 0) > 0 || (attendance?.total_entries ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          title="Entradas Vendidas"
          value={attendance?.entries_sold ?? 0}
          icon={Ticket}
          variant="accent"
          prevValue={attendance?.prev_entries_sold}
          currentValue={attendance?.entries_sold}
          description="vs. periodo anterior"
        />
        <MetricCard
          title="Asistencia Real"
          value={attendance?.total_entries ?? 0}
          icon={Users}
          variant="success"
          prevValue={attendance?.prev_total_entries}
          currentValue={attendance?.total_entries}
          description="vs. periodo anterior"
        />
        <MetricCard
          title="Tasa No-Show"
          value={hasData ? `${attendance?.no_show_rate ?? 0}%` : "N/A"}
          icon={UserX}
          variant="danger"
          description={hasData && noShowCount > 0 ? `${noShowCount} no asistieron` : "Sin no-shows"}
        />
        <MetricCard
          title="Tiempo Promedio"
          value={`${attendance?.avg_dwell_minutes ?? 0} min`}
          icon={Clock}
          variant="default"
          description={`${attendance?.active_sessions ?? 0} sesiones activas`}
        />
      </div>

      {/* Comparative Chart */}
      <ChartCard
        title="Vendidas vs Asistencia por Hora"
        isLoading={attLoading || hourlyLoading}
        isFetching={isFetching}
        isEmpty={!chartData.length}
        action={
          <ChartExportButton
            chartTitle="Asistencia por Hora"
            dateRange={{ from: filters.date_from, to: filters.date_to }}
            columns={EXPORT_COLUMNS}
            getData={getChartData}
            chartRef={chartRef}
          />
        }
      >
        <div ref={chartRef}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 12 }} width={40} className="text-muted-foreground" allowDecimals={false} />
              <Tooltip content={<ComparisonTooltip />} />
              <Legend
                content={() => (
                  <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--chart-5)" }} />
                      Vendidas
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "var(--chart-2)" }} />
                      Asistencia
                    </div>
                  </div>
                )}
              />
              <Bar dataKey="entries_sold" name="Vendidas" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="entries" name="Asistencia" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
