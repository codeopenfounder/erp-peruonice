"use client";

import { Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OperationalLeaks } from "@/types/kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

interface PromocionesCardProps {
  data: OperationalLeaks | undefined;
  isLoading: boolean;
}

export function PromocionesCard({ data, isLoading }: PromocionesCardProps) {
  return (
    <Card className="border-accent/20">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <Tag className="h-4 w-4 text-accent" />
        </div>
        <CardTitle className="text-sm font-medium">Promociones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-accent/5 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Impacto en Tx
              </p>
              <p className="text-lg font-bold text-foreground">
                {(data?.promo_pct_tx ?? 0).toFixed(2)}%
              </p>
              <p className="text-xs text-muted-foreground">
                {data?.promo_tx_count ?? 0} transacciones con promo
              </p>
            </div>

            <div className="rounded-lg bg-accent/5 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Impacto Financiero
              </p>
              <p className="text-lg font-bold text-foreground">
                {(data?.promo_pct_revenue ?? 0).toFixed(2)}%
              </p>
              <p className="text-xs text-accent font-medium">
                {formatCurrency(data?.promo_discount_total ?? 0)}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
