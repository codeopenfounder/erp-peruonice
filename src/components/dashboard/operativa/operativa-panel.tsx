"use client";

import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { useOperationalLeaks } from "@/hooks/queries/use-kpi";
import { AnulacionesCard } from "./anulaciones-card";
import { CortesiasCard } from "./cortesias-card";
import { PromocionesCard } from "./promociones-card";

export function OperativaPanel() {
  const { filters } = useDashboardFilters();
  const { data, isLoading } = useOperationalLeaks(filters);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <AnulacionesCard data={data} isLoading={isLoading} />
      <CortesiasCard data={data} isLoading={isLoading} />
      <PromocionesCard data={data} isLoading={isLoading} />
    </div>
  );
}
