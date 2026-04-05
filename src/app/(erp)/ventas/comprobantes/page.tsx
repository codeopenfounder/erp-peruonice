"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  DollarSign,
  FileText,
  Receipt,
  FileWarning,
  Search,
} from "lucide-react";
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
import { getInvoiceColumns } from "@/components/ventas/invoice-columns";
import { InvoiceDetailDialog } from "@/components/ventas/invoice-detail-dialog";
import {
  useInvoices,
  useInvoiceKPIs,
} from "@/hooks/queries/use-ventas";
import { useCashRegisterStatuses } from "@/hooks/queries/use-gastos";
import type { InvoiceFilters } from "@/types/invoice";

const PAGE_SIZE = 50;

export default function ComprobantesPage() {
  return (
    <Suspense>
      <ComprobantesContent />
    </Suspense>
  );
}

function ComprobantesContent() {
  const searchParams = useSearchParams();

  // Filter state
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [cashRegisterId, setCashRegisterId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Dialog state
  const [detailId, setDetailId] = useState<string | null>(null);

  // Auto-open modal from URL params (e.g. from Transacciones "Ver comprobante")
  useEffect(() => {
    const urlId = searchParams.get("id");
    if (urlId) setDetailId(urlId);
    const urlSearch = searchParams.get("search");
    if (urlSearch) setSearch(urlSearch);
  }, [searchParams]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [search, docType, statusFilter, paymentFilter, dateFrom, dateTo, cashRegisterId]);

  const filters = useMemo<InvoiceFilters>(
    () => ({
      search: search || undefined,
      document_type: docType || undefined,
      status: statusFilter || undefined,
      payment_method: paymentFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      cash_register_id: cashRegisterId || undefined,
      page: page + 1,
    }),
    [search, docType, statusFilter, paymentFilter, dateFrom, dateTo, cashRegisterId, page]
  );

  // Queries
  const { data: kpis, isLoading: isLoadingKPIs } = useInvoiceKPIs(dateFrom || undefined);
  const { data: invoiceData, isLoading: isLoadingInvoices, isFetching } = useInvoices(filters);
  const { data: registers } = useCashRegisterStatuses();

  const columns = useMemo(() => getInvoiceColumns((id) => setDetailId(id)), []);

  const totalPages = invoiceData
    ? Math.ceil(invoiceData.total / PAGE_SIZE)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comprobantes"
        description="Facturas, boletas y notas emitidas desde POI Fact"
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
            title="Total ventas"
            value={`S/ ${(kpis?.total_sales ?? 0).toFixed(2)}`}
            description="Suma de comprobantes emitidos"
            icon={DollarSign}
            variant="primary"
          />
          <KpiCard
            title="Facturas"
            value={kpis?.facturas ?? 0}
            description="Comprobantes tipo factura"
            icon={FileText}
            variant="success"
          />
          <KpiCard
            title="Boletas"
            value={kpis?.boletas ?? 0}
            description="Comprobantes tipo boleta"
            icon={Receipt}
            variant="default"
          />
          <KpiCard
            title="NC / ND"
            value={kpis?.notas_credito ?? 0}
            description="Notas de crédito y débito"
            icon={FileWarning}
            variant="warning"
          />
        </KpiGrid>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por serie, cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={docType ?? "all"}
          onValueChange={(v) => setDocType(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tipo doc." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="factura">Factura</SelectItem>
            <SelectItem value="boleta">Boleta</SelectItem>
            <SelectItem value="nota_credito">Nota Crédito</SelectItem>
            <SelectItem value="nota_debito">Nota Débito</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter ?? "all"}
          onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="issued">Emitido</SelectItem>
            <SelectItem value="sent_to_sunat">Enviado SUNAT</SelectItem>
            <SelectItem value="accepted">Aceptado</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
            <SelectItem value="voided">Anulado</SelectItem>
            <SelectItem value="pending_void">Anulación pendiente</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={paymentFilter ?? "all"}
          onValueChange={(v) => setPaymentFilter(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Método pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los métodos</SelectItem>
            <SelectItem value="cash">Efectivo</SelectItem>
            <SelectItem value="card">Tarjeta</SelectItem>
            <SelectItem value="transfer">Transferencia</SelectItem>
            <SelectItem value="credit">Crédito</SelectItem>
            <SelectItem value="mixed">Mixto</SelectItem>
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
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={invoiceData?.data ?? []}
        manualPagination
        pageCount={totalPages}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={invoiceData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoadingInvoices}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay comprobantes para los filtros seleccionados"
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
