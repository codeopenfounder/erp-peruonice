"use client";

import { useState, useMemo, useEffect } from "react";
import {
  DollarSign,
  TrendingDown,
  FileSpreadsheet,
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
import { DailyReportDialog } from "@/components/contabilidad/daily-report-dialog";
import { getMovementsColumns } from "@/components/contabilidad/movements-columns";
import {
  useGastosKPIs,
  useGastosMovements,
  useCashRegisterStatuses,
} from "@/hooks/queries/use-gastos";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import type { GastosFilters } from "@/types/gastos";

const PAGE_SIZE = 50;

const TYPE_OPTIONS = [
  { value: "sale", label: "Venta" },
  { value: "expense", label: "Egreso" },
  { value: "refund", label: "Devolución" },
  { value: "petty_cash_in", label: "Caja Chica" },
];

function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

export default function MovimientosCajaPage() {
  // Filter state
  const [branchId, setBranchId] = useState<string>("all");
  const [cashRegisterId, setCashRegisterId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  // Dialog state
  const [reportOpen, setReportOpen] = useState(false);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [branchId, cashRegisterId, typeFilter, dateFrom, dateTo]);

  const filters = useMemo<GastosFilters>(
    () => ({
      branch_id: branchId !== "all" ? branchId : undefined,
      cash_register_id: cashRegisterId !== "all" ? cashRegisterId : undefined,
      type: typeFilter !== "all" ? typeFilter : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page: page + 1,
    }),
    [branchId, cashRegisterId, typeFilter, dateFrom, dateTo, page]
  );

  // Queries
  const { data: kpis, isLoading: isLoadingKPIs } = useGastosKPIs();
  const { data: movementData, isLoading, isFetching } = useGastosMovements(filters);
  const { data: registers } = useCashRegisterStatuses();
  const { data: branches } = useBranchesForSelect();

  const columns = useMemo(() => getMovementsColumns(), []);

  const totalPages = movementData
    ? Math.ceil(movementData.total / PAGE_SIZE)
    : 0;

  const KPI_ITEMS = [
    {
      label: "Ventas hoy",
      value: formatCurrency(kpis?.total_sales_today ?? 0),
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Egresos hoy",
      value: formatCurrency(kpis?.total_cash_out_today ?? 0),
      icon: TrendingDown,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimientos de Caja"
        description="Registro de ventas, ingresos, egresos y otros movimientos"
        actions={
          <Button variant="outline" onClick={() => setReportOpen(true)}>
            <FileSpreadsheet className="mr-2 size-4" />
            Reporte del dia
          </Button>
        }
      />

      {/* KPIs */}
      {isLoadingKPIs ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-2">
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
                    <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
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
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas las sedes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sedes</SelectItem>
            {branches?.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
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
        data={movementData?.data ?? []}
        manualPagination
        pageCount={totalPages}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={movementData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay movimientos registrados"
      />

      {/* Daily Report Dialog */}
      <DailyReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        registers={registers ?? []}
      />
    </div>
  );
}
