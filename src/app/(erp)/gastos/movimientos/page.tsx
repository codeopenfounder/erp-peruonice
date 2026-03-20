"use client";

import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { getExpenseFundMovementsColumns } from "@/components/gastos/expense-fund-movements-columns";
import {
  useExpenseFundMovements,
  useExpenseFundStatus,
} from "@/hooks/queries/use-expense-fund";
import type { ExpenseFundFilters } from "@/types/gastos";

const PAGE_SIZE = 50;

const TYPE_OPTIONS = [
  { value: "assignment", label: "Asignación" },
  { value: "adjustment", label: "Ajuste" },
  { value: "expense", label: "Egreso" },
];

export default function GastosMovimientosPage() {
  // Filter state
  const [cashRegisterId, setCashRegisterId] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [cashRegisterId, typeFilter, dateFrom, dateTo]);

  const filters = useMemo<ExpenseFundFilters>(
    () => ({
      cash_register_id: cashRegisterId !== "all" ? cashRegisterId : undefined,
      type: typeFilter !== "all" ? typeFilter : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page: page + 1,
    }),
    [cashRegisterId, typeFilter, dateFrom, dateTo, page]
  );

  // Queries
  const { data: movementData, isLoading, isFetching } = useExpenseFundMovements(filters);
  const { data: fundData } = useExpenseFundStatus();
  const registers = fundData?.registers;

  const columns = useMemo(() => getExpenseFundMovementsColumns(), []);

  const totalPages = movementData
    ? Math.ceil(movementData.total / PAGE_SIZE)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimientos de Gastos"
        description="Historial de asignaciones, ajustes y egresos del fondo de gastos"
      />

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
    </div>
  );
}
