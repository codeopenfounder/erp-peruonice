"use client";

import { useDashboardFilters } from "@/components/dashboard/dashboard-filters-provider";
import { useProductRanking } from "@/hooks/queries/use-kpi";
import { TopProductsChart } from "./top-products-chart";
import { FlopProductsTable } from "./flop-products-table";
import { ProductHourlyChart } from "./product-hourly-chart";

export function ProductosPanel() {
  const { filters } = useDashboardFilters();
  const { data, isLoading, isFetching } = useProductRanking(filters);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopProductsChart
          data={data?.top ?? []}
          isLoading={isLoading}
          isFetching={isFetching}
          dateRange={{ from: filters.date_from, to: filters.date_to }}
        />
        <FlopProductsTable data={data?.flop ?? []} isLoading={isLoading} />
      </div>
      <ProductHourlyChart dateRange={{ from: filters.date_from, to: filters.date_to }} />
    </div>
  );
}
