"use client";

import { Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OperationalLeaks } from "@/types/kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

interface CortesiasCardProps {
  data: OperationalLeaks | undefined;
  isLoading: boolean;
}

export function CortesiasCard({ data, isLoading }: CortesiasCardProps) {
  return (
    <Card className="border-warning/20">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10">
          <Gift className="h-4 w-4 text-warning" />
        </div>
        <CardTitle className="text-sm font-medium">Cortesias</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-warning/5 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Volumen
              </p>
              <p className="text-lg font-bold text-foreground">
                {data?.cortesia_count ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                cortesias entregadas
              </p>
            </div>

            <div className="rounded-lg bg-warning/5 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Impacto en Tx
              </p>
              <p className="text-lg font-bold text-foreground">
                {(data?.cortesia_pct_tx ?? 0).toFixed(2)}%
              </p>
            </div>

            <div className="rounded-lg bg-warning/5 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Impacto Financiero
              </p>
              <p className="text-lg font-bold text-foreground">
                {(data?.cortesia_pct_revenue ?? 0).toFixed(2)}%
              </p>
              <p className="text-xs text-warning font-medium">
                {formatCurrency(data?.cortesia_amount ?? 0)}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
