"use client";

import { Receipt, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/dashboard/shared/metric-card";
import type { SalesSummary } from "@/types/kpi";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(value);

interface TransactionsCardProps {
  data: SalesSummary | undefined;
  isLoading: boolean;
}

export function TransactionsCard({ data }: TransactionsCardProps) {
  return (
    <>
      <MetricCard
        title="N° Transacciones"
        value={data?.transaction_count ?? 0}
        icon={Receipt}
        variant="accent"
        prevValue={data?.prev_transaction_count}
        currentValue={data?.transaction_count}
        description="vs. periodo anterior"
      />
      <MetricCard
        title="Ticket Promedio"
        value={formatCurrency(data?.avg_ticket ?? 0)}
        icon={TrendingUp}
        variant="success"
        prevValue={data?.prev_avg_ticket}
        currentValue={data?.avg_ticket}
        description="vs. periodo anterior"
      />
    </>
  );
}
