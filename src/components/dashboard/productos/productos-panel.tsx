"use client";

import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { useProductRanking } from "@/hooks/queries/use-kpi";
import { TopProductsChart } from "./top-products-chart";
import { FlopProductsTable } from "./flop-products-table";

export function ProductosPanel() {
  const { filters } = useDashboardFilters();
  const { data, isLoading, isFetching } = useProductRanking(filters);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <TopProductsChart
        data={data?.top ?? []}
        isLoading={isLoading}
        isFetching={isFetching}
      />
      <FlopProductsTable data={data?.flop ?? []} isLoading={isLoading} />
    </div>
  );
}
