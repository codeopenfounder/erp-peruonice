"use client";

import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductKPIs } from "@/hooks/queries/use-products";
import { DashboardFiltersProvider } from "@/components/dashboard/dashboard-filters-provider";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";

function LowStockAlert() {
  const { data: products, isLoading } = useProductKPIs();
  const lowStock = (products as any)?.low_stock_count ?? 0;

  if (isLoading || lowStock === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="flex items-center gap-4 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {lowStock} productos con stock bajo
          </p>
          <p className="text-xs text-muted-foreground">
            Revisa el inventario para reabastecer
          </p>
        </div>
        <Link href="/inventario/productos">
          <Button variant="outline" size="sm">
            Ver
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      }
    >
      <DashboardFiltersProvider>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/poi-logo.png"
                alt="Perú On Ice"
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Perú On Ice
                </h1>
                <p className="text-sm text-muted-foreground">
                  Dashboard analitico
                </p>
              </div>
            </div>
            <DashboardFilters />
          </div>

          {/* Summary KPIs */}
          <DashboardSummary />

          {/* Module Tabs */}
          <DashboardTabs />

          {/* Low stock alert */}
          <LowStockAlert />
        </div>
      </DashboardFiltersProvider>
    </Suspense>
  );
}
