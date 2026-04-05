"use client";

import { useState, useMemo, useEffect } from "react";
import {
  FileSearch,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
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
import { getArqueoColumns } from "@/components/contabilidad/arqueo-columns";
import {
  useArqueoKPIs,
  useArqueos,
} from "@/hooks/queries/use-arqueos";
import { useCashRegisterStatuses } from "@/hooks/queries/use-gastos";
import type { ArqueoFilters } from "@/types/arqueo";
import Link from "next/link";

const PAGE_SIZE = 50;

function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

export default function ArqueosPage() {
  const [cashRegisterId, setCashRegisterId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [cashRegisterId, typeFilter, dateFrom, dateTo]);

  const filters = useMemo<ArqueoFilters>(
    () => ({
      cash_register_id:
        cashRegisterId !== "all" ? cashRegisterId : undefined,
      type:
        typeFilter !== "all"
          ? (typeFilter as "cierre" | "sorpresa")
          : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page: page + 1,
    }),
    [cashRegisterId, typeFilter, dateFrom, dateTo, page]
  );

  const { data: kpis, isLoading: isLoadingKPIs } = useArqueoKPIs();
  const { data: arqueoData, isLoading, isFetching } = useArqueos(filters);
  const { data: registers } = useCashRegisterStatuses();

  const columns = useMemo(() => getArqueoColumns(), []);
  const totalPages = arqueoData
    ? Math.ceil(arqueoData.total / PAGE_SIZE)
    : 0;

  const KPI_ITEMS = [
    {
      label: "Arqueos este mes",
      value: String(kpis?.total_month ?? 0),
      icon: ClipboardCheck,
      color: "text-foreground",
      bg: "bg-secondary",
    },
    {
      label: "Arqueos sorpresa",
      value: String(kpis?.total_sorpresas_month ?? 0),
      icon: FileSearch,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Promedio diferencia",
      value: formatCurrency(kpis?.avg_difference ?? 0),
      icon: kpis && kpis.avg_difference > 5 ? AlertTriangle : CheckCircle2,
      color:
        kpis && kpis.avg_difference > 5
          ? "text-amber-500"
          : "text-success",
      bg:
        kpis && kpis.avg_difference > 5
          ? "bg-amber-500/10"
          : "bg-success/10",
    },
    {
      label: "Con diferencia > S/ 5",
      value: String(kpis?.flagged_count ?? 0),
      icon: AlertTriangle,
      color:
        kpis && kpis.flagged_count > 0
          ? "text-destructive"
          : "text-muted-foreground",
      bg:
        kpis && kpis.flagged_count > 0
          ? "bg-destructive/10"
          : "bg-secondary",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arqueos de Caja"
        description="Auditorías y conteos de efectivo en cajas registradoras"
        actions={
          <Button asChild>
            <Link href="/finanzas/arqueos/nuevo">
              <Plus className="mr-2 size-4" />
              Arqueo Sorpresa
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
        {registers && registers.length > 0 && (
          <Select value={cashRegisterId} onValueChange={setCashRegisterId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todas las cajas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cajas</SelectItem>
              {registers.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="cierre">Cierre</SelectItem>
            <SelectItem value="sorpresa">Sorpresa</SelectItem>
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
        data={arqueoData?.data ?? []}
        manualPagination
        pageCount={totalPages}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={arqueoData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay arqueos registrados"
      />
    </div>
  );
}
