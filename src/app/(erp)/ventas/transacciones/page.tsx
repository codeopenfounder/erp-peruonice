"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Search,
  Eye,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { getTodayPeru } from "@/lib/date-utils";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvoiceDetailDialog } from "@/components/ventas/invoice-detail-dialog";
import { useSales, useSalesKPIs } from "@/hooks/queries/use-sales";
import { useCashRegisterStatuses } from "@/hooks/queries/use-gastos";
import type { SalesFilters, SaleListItem } from "@/types/sale";
import type { ColumnDef } from "@tanstack/react-table";

const PAGE_SIZE = 50;

const PAYMENT_LABELS: Record<string, { label: string; className: string }> = {
  cash: {
    label: "Efectivo",
    className: "bg-emerald-500/10 text-emerald-500",
  },
  card: {
    label: "Tarjeta",
    className: "bg-blue-500/10 text-blue-500",
  },
  transfer: {
    label: "Transfer.",
    className: "bg-purple-500/10 text-purple-500",
  },
  credit: {
    label: "Credito",
    className: "bg-amber-500/10 text-amber-500",
  },
  mixed: {
    label: "Mixto",
    className: "bg-zinc-500/10 text-zinc-400",
  },
};

export default function TransaccionesPageWrapper() {
  return (
    <Suspense fallback={<div className="space-y-6"><Skeleton className="h-16 w-full" /><Skeleton className="h-96 w-full rounded-xl" /></div>}>
      <TransaccionesPage />
    </Suspense>
  );
}

const TRANSACTION_TYPE_MAP: Record<string, { label: string; className: string }> = {
  factura: { label: "Venta", className: "bg-emerald-500/10 text-emerald-600" },
  boleta: { label: "Venta", className: "bg-emerald-500/10 text-emerald-600" },
  nota_credito: { label: "Devolución", className: "bg-amber-500/10 text-amber-600" },
  nota_debito: { label: "Ajuste", className: "bg-blue-500/10 text-blue-600" },
};

function TransaccionesPage() {
  const searchParams = useSearchParams();
  const urlInvoiceId = searchParams.get("id");

  // Filter state
  const [date, setDate] = useState<string>(getTodayPeru());
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [cashRegisterId, setCashRegisterId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Dialog state — auto-open from URL param
  const [detailId, setDetailId] = useState<string | null>(urlInvoiceId);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [search, paymentFilter, cashRegisterId, date]);

  const filters = useMemo<SalesFilters>(
    () => ({
      date: date || undefined,
      search: search || undefined,
      payment_method: paymentFilter || undefined,
      cash_register_id: cashRegisterId || undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
    }),
    [date, search, paymentFilter, cashRegisterId, page]
  );

  // Queries
  const { data: kpis, isLoading: isLoadingKPIs } = useSalesKPIs(date || undefined);
  const { data: salesData, isLoading: isLoadingSales, isFetching } = useSales(filters);
  const { data: registers } = useCashRegisterStatuses();

  // Columns
  const columns = useMemo<ColumnDef<SaleListItem>[]>(
    () => [
      {
        accessorKey: "issue_date",
        header: "Fecha",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {row.original.issue_date
              ? row.original.issue_date.split("-").reverse().join("/")
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Hora",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {format(new Date(row.original.created_at), "HH:mm")}
          </span>
        ),
      },
      {
        accessorKey: "document_type",
        header: "Tipo",
        cell: ({ row }) => {
          const cfg = TRANSACTION_TYPE_MAP[row.original.document_type] ?? {
            label: row.original.document_type,
            className: "bg-muted text-muted-foreground",
          };
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.className}`}>
              {cfg.label}
            </span>
          );
        },
      },
      {
        accessorKey: "customer_name",
        header: "Cliente",
        cell: ({ row }) => (
          <span className="block max-w-[150px] truncate text-sm text-foreground">
            {row.original.customer_name || "Varios"}
          </span>
        ),
      },
      {
        id: "subtotal",
        header: () => <span className="block text-right">Subtotal</span>,
        cell: ({ row }) => {
          const sub = Number(row.original.op_gravada) + Number(row.original.op_exonerada) + Number(row.original.op_inafecta);
          return (
            <span className="block text-right font-mono text-xs tabular-nums text-foreground">
              S/ {sub.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: "igv_total",
        header: () => <span className="block text-right">IGV</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono text-xs tabular-nums text-muted-foreground">
            S/ {Number(row.original.igv_total).toFixed(2)}
          </span>
        ),
      },
      {
        id: "descuento",
        header: () => <span className="block text-right">Dcto.</span>,
        cell: ({ row }) => {
          const desc = Number(row.original.discount_total) + Number(row.original.promotion_discount);
          if (desc === 0) return <span className="block text-right text-xs text-muted-foreground">—</span>;
          return (
            <span className="block text-right font-mono text-xs tabular-nums text-amber-600">
              -S/ {desc.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: "total",
        header: () => <span className="block text-right">Total</span>,
        cell: ({ row }) => (
          <span className="block text-right font-mono text-sm font-semibold tabular-nums text-foreground">
            S/ {Number(row.original.total).toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "payment_method",
        header: "Pago",
        cell: ({ row }) => {
          const pm = row.original.payment_method;
          if (!pm) return <span className="text-xs text-muted-foreground">—</span>;
          const info = PAYMENT_LABELS[pm];
          if (!info) return <span className="text-xs text-muted-foreground">{pm}</span>;
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${info.className}`}>
              {info.label}
            </span>
          );
        },
      },
      {
        accessorKey: "cashier_name",
        header: "Cajero",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.cashier_name || "—"}</span>
        ),
      },
      {
        accessorKey: "branch_name",
        header: "Sede",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.branch_name || "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDetailId(row.original.id)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Ver detalle"
            >
              <Eye className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => window.location.href = `/ventas/comprobantes?search=${row.original.series_code}-${String(row.original.correlative_number).padStart(8, "0")}`}
              className="rounded-md p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10 transition-colors"
              title="Ver comprobante"
            >
              <FileText className="size-4" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  const totalPages = salesData ? Math.ceil(salesData.total / PAGE_SIZE) : 0;

  // Hourly chart data
  const hourlyData = kpis?.by_hour ?? [];
  const maxHourTotal = hourlyData.length > 0
    ? Math.max(...hourlyData.map((h) => h.total))
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transacciones"
        description="Registro de ventas realizadas en POI Fact"
      />

      {/* KPIs */}
      {isLoadingKPIs ? (
        <KpiGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </KpiGrid>
      ) : (
        <KpiGrid>
          <KpiCard
            title="Ventas del dia"
            value={`S/ ${(kpis?.total_sales ?? 0).toFixed(2)}`}
            description="Total facturado hoy"
            icon={DollarSign}
            variant="primary"
          />
          <KpiCard
            title="Transacciones"
            value={kpis?.transaction_count ?? 0}
            description="Comprobantes emitidos"
            icon={ShoppingCart}
            variant="default"
          />
          <KpiCard
            title="Ticket promedio"
            value={`S/ ${(kpis?.average_ticket ?? 0).toFixed(2)}`}
            description="Promedio por venta"
            icon={TrendingUp}
            variant="success"
          />
          <KpiCard
            title="Items vendidos"
            value={kpis?.items_sold ?? 0}
            description="Unidades despachadas"
            icon={Package}
            variant="warning"
          />
        </KpiGrid>
      )}

      {/* Hourly Chart */}
      {!isLoadingKPIs && hourlyData.length > 0 && (
        <div className="animate-in fade-in duration-500 rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Ventas por hora
          </h3>
          <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height: 120 }}>
            {hourlyData.map((h) => {
              const pct = maxHourTotal > 0 ? (h.total / maxHourTotal) * 100 : 0;
              return (
                <div
                  key={h.hour}
                  className="flex min-w-[36px] flex-1 flex-col items-center gap-1"
                >
                  <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                    S/{h.total >= 1000 ? `${(h.total / 1000).toFixed(1)}k` : Math.round(h.total)}
                  </span>
                  <div className="relative w-full flex justify-center" style={{ height: 80 }}>
                    <div
                      className="w-5 rounded-t bg-primary/80 transition-all duration-500"
                      style={{
                        height: `${Math.max(pct, 2)}%`,
                        position: "absolute",
                        bottom: 0,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                    {String(h.hour).padStart(2, "0")}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[160px]"
        />

        <Select
          value={paymentFilter ?? "all"}
          onValueChange={(v) => setPaymentFilter(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Metodo pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los metodos</SelectItem>
            <SelectItem value="cash">Efectivo</SelectItem>
            <SelectItem value="card">Tarjeta</SelectItem>
            <SelectItem value="transfer">Transferencia</SelectItem>
            <SelectItem value="credit">Credito</SelectItem>
            <SelectItem value="mixed">Mixto</SelectItem>
          </SelectContent>
        </Select>

        {registers && registers.length > 0 && (
          <Select
            value={cashRegisterId ?? "all"}
            onValueChange={(v) => setCashRegisterId(v === "all" ? null : v)}
          >
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

        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={salesData?.data ?? []}
        manualPagination
        pageCount={totalPages}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={salesData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoadingSales}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay transacciones para los filtros seleccionados"
      />

      {/* Detail Dialog */}
      {detailId && (
        <InvoiceDetailDialog
          open={!!detailId}
          invoiceId={detailId}
          onOpenChange={(open) => {
            if (!open) setDetailId(null);
          }}
        />
      )}
    </div>
  );
}
