"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Link2,
  CheckCircle2,
  DollarSign,
  Clock,
  Plus,
} from "lucide-react";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { getPaymentLinkColumns } from "@/components/reservas/payment-link-columns";
import {
  usePaymentLinkKPIs,
  usePaymentLinks,
  useCancelPaymentLink,
} from "@/hooks/queries/use-payment-links";
import type { PaymentLinkFilters } from "@/types/payment-link";
import Link from "next/link";
import { toast } from "sonner";

const PAGE_SIZE = 50;

function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

export default function PaymentLinksPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, dateFrom, dateTo]);

  const filters = useMemo<PaymentLinkFilters>(
    () => ({
      status:
        statusFilter !== "all"
          ? (statusFilter as PaymentLinkFilters["status"])
          : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page: page + 1,
    }),
    [statusFilter, dateFrom, dateTo, page]
  );

  const { data: kpis, isLoading: isLoadingKPIs } = usePaymentLinkKPIs();
  const { data: linkData, isLoading, isFetching } = usePaymentLinks(filters);
  const cancelMutation = useCancelPaymentLink();

  const handleCancel = async (id: string) => {
    const result = await cancelMutation.mutateAsync(id);
    if (result.success) {
      toast.success("Link cancelado");
    } else {
      toast.error(result.error || "Error al cancelar");
    }
  };

  const columns = useMemo(() => getPaymentLinkColumns(handleCancel), []);
  const totalPages = linkData ? Math.ceil(linkData.total / PAGE_SIZE) : 0;

  const KPI_ITEMS = [
    {
      label: "Links activos",
      value: String(kpis?.active_count ?? 0),
      icon: Link2,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Pagados este mes",
      value: String(kpis?.paid_month ?? 0),
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Cobrado este mes",
      value: formatCurrency(kpis?.total_collected_month ?? 0),
      icon: DollarSign,
      color: "text-foreground",
      bg: "bg-secondary",
    },
    {
      label: "Pendientes",
      value: String(kpis?.pending_count ?? 0),
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Links de Pago"
        description="Genera links de pago online para reservas via Culqi"
        actions={
          <Button asChild>
            <Link href="/reservas/links/nuevo">
              <Plus className="mr-2 size-4" />
              Nuevo Link
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      {isLoadingKPIs ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {KPI_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
              >
                <Card className="border-border/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${item.bg}`}
                    >
                      <Icon className={`size-5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-lg font-semibold font-mono tabular-nums">
                        {item.value}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.label}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="paid">Pagado</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px]"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px]"
          />
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={linkData?.data ?? []}
        manualPagination
        pageCount={totalPages}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={linkData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay links de pago generados"
      />
    </div>
  );
}
