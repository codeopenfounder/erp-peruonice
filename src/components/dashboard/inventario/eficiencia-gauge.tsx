"use client";

import { ChartCard } from "@/components/dashboard/shared/chart-card";
import { GaugeChart } from "@/components/dashboard/shared/gauge-chart";
import type { InventoryHealth } from "@/types/kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

interface EficienciaGaugeProps {
  data: InventoryHealth | undefined;
  isLoading: boolean;
}

export function EficienciaGauge({ data, isLoading }: EficienciaGaugeProps) {
  return (
    <ChartCard title="Eficiencia de Inventario" isLoading={isLoading}>
      <div className="flex flex-col items-center gap-4 py-4">
        <GaugeChart
          value={data?.efficiency_pct ?? 0}
          max={100}
          label="Precision del almacen"
          suffix="%"
          size={200}
        />
        <p className="text-sm text-muted-foreground">
          Valor total de discrepancias:{" "}
          <span className="font-semibold text-foreground">
            {formatCurrency(data?.total_discrepancy_value ?? 0)}
          </span>
        </p>
      </div>
    </ChartCard>
  );
}
