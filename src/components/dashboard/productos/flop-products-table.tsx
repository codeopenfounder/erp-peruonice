"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyChartState } from "@/components/dashboard/shared/empty-chart-state";
import type { ProductRankingItem } from "@/types/kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

interface FlopProductsTableProps {
  data: ProductRankingItem[];
  isLoading: boolean;
}

export function FlopProductsTable({ data, isLoading }: FlopProductsTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Menos Vendidos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded" />
            ))}
          </div>
        ) : !data.length ? (
          <EmptyChartState
            message="Sin datos de productos para este periodo"
            height={300}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Uds. vendidas</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">% Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.product_id}>
                  <TableCell className="max-w-[180px] truncate font-medium">
                    {item.product_name}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.units_sold}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.total_revenue)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {item.pct_of_total.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
