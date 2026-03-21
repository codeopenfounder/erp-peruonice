"use client";

import { useState, useMemo, useEffect } from "react";
import { type ColumnDef } from "@tanstack/react-table";
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
import {
  useClosingHistory,
  useCashRegisterStatuses,
} from "@/hooks/queries/use-gastos";
import type { ClosingHistoryFilters, ClosingHistoryItem } from "@/types/gastos";

const PAGE_SIZE = 50;

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--";
  }
}

function formatCurrency(amount: number | null): string {
  if (amount == null) return "--";
  return `S/ ${amount.toFixed(2)}`;
}

function getDifferenceColor(difference: number | null): string {
  if (difference == null) return "text-muted-foreground";
  const abs = Math.abs(difference);
  if (abs === 0) return "text-success font-medium";
  if (abs <= 5) return "text-amber-500 font-medium";
  return "text-destructive font-medium";
}

const columns: ColumnDef<ClosingHistoryItem>[] = [
  {
    accessorKey: "opened_at",
    header: "Apertura",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {formatDateTime(row.original.opened_at)}
      </span>
    ),
  },
  {
    accessorKey: "closed_at",
    header: "Cierre",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {formatDateTime(row.original.closed_at)}
      </span>
    ),
  },
  {
    accessorKey: "cash_register_name",
    header: "Caja",
    cell: ({ row }) => (
      <div className="text-sm">
        <span>{row.original.cash_register_name}</span>
        <span className="ml-1 font-mono text-xs text-muted-foreground">
          {row.original.cash_register_code}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "opened_by_name",
    header: "Cajero",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.opened_by_name || <span className="text-muted-foreground">&mdash;</span>}
      </span>
    ),
  },
  {
    accessorKey: "closed_by_name",
    header: "Resp. Cierre",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.closed_by_name || <span className="text-muted-foreground">&mdash;</span>}
      </span>
    ),
  },
  {
    accessorKey: "deposit_amount",
    header: () => <div className="text-right">Deposito</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums">
        {formatCurrency(row.original.deposit_amount)}
      </div>
    ),
  },
  {
    accessorKey: "opening_accumulated",
    header: () => <div className="text-right">Acum. Apertura</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums text-muted-foreground">
        {formatCurrency(row.original.opening_accumulated)}
      </div>
    ),
  },
  {
    accessorKey: "expected_amount",
    header: () => <div className="text-right">Esperado</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums">
        {formatCurrency(row.original.expected_amount)}
      </div>
    ),
  },
  {
    accessorKey: "closing_amount",
    header: () => <div className="text-right">Contado</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums">
        {formatCurrency(row.original.closing_amount)}
      </div>
    ),
  },
  {
    accessorKey: "difference",
    header: () => <div className="text-right">Diferencia</div>,
    cell: ({ row }) => {
      const diff = row.original.difference;
      return (
        <div className={`text-right font-mono text-sm tabular-nums ${getDifferenceColor(diff)}`}>
          {diff != null
            ? `${diff >= 0 ? "+" : ""}S/ ${diff.toFixed(2)}`
            : "--"}
        </div>
      );
    },
  },
  {
    accessorKey: "closing_accumulated",
    header: () => <div className="text-right">Acum. Cierre</div>,
    cell: ({ row }) => (
      <div className="text-right font-mono text-sm tabular-nums font-medium">
        {formatCurrency(row.original.closing_accumulated)}
      </div>
    ),
  },
  {
    accessorKey: "notes",
    header: "Notas",
    cell: ({ row }) => (
      <span className="max-w-[150px] truncate text-sm text-muted-foreground block">
        {row.original.notes || <span className="text-muted-foreground">&mdash;</span>}
      </span>
    ),
  },
];

export default function CierresPage() {
  const [cashRegisterId, setCashRegisterId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [cashRegisterId, dateFrom, dateTo]);

  const filters = useMemo<ClosingHistoryFilters>(
    () => ({
      cash_register_id: cashRegisterId !== "all" ? cashRegisterId : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page: page + 1,
    }),
    [cashRegisterId, dateFrom, dateTo, page]
  );

  const { data: closingData, isLoading, isFetching } = useClosingHistory(filters);
  const { data: registers } = useCashRegisterStatuses();

  const totalPages = closingData
    ? Math.ceil(closingData.total / PAGE_SIZE)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cierres de Caja"
        description="Historial de aperturas y cierres de cajas registradoras"
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
        data={closingData?.data ?? []}
        manualPagination
        pageCount={totalPages}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={closingData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay cierres registrados"
      />
    </div>
  );
}
