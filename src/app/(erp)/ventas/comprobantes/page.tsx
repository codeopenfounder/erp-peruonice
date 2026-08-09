"use client";

import { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DollarSign,
  FileText,
  Receipt,
  FileWarning,
  Search,
  TriangleAlert,
} from "lucide-react";
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
import { getInvoiceColumns, isSunatStuck } from "@/components/ventas/invoice-columns";
import {
  SUNAT_AUTH_FAULTS,
  SUNAT_AUTH_FAULT_REMEDY,
  extractSunatCode,
  isProviderAuthFault,
} from "@/lib/sunat/policy";
import { InvoiceDetailDialog } from "@/components/ventas/invoice-detail-dialog";
import {
  useInvoices,
  useInvoiceKPIs,
} from "@/hooks/queries/use-ventas";
import { useCashRegisterStatuses } from "@/hooks/queries/use-gastos";
import {
  checkPendingVoidTickets,
  getInvoicePdfData,
  retrySunatFromErp,
} from "@/actions/ventas";
import { downloadComprobantePdf } from "@/lib/pdf/comprobante-pdf";
import type { DocumentType } from "@/lib/pdf/sunat-format";
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
  const queryClient = useQueryClient();

  // Filter state
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [cashRegisterId, setCashRegisterId] = useState<string | null>(null);
  const [onlySunatProblems, setOnlySunatProblems] = useState(false);
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
  }, [search, docType, statusFilter, paymentFilter, dateFrom, dateTo, cashRegisterId, onlySunatProblems]);

  const filters = useMemo<InvoiceFilters>(
    () => ({
      search: search || undefined,
      document_type: docType || undefined,
      status: statusFilter || undefined,
      payment_method: paymentFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      cash_register_id: cashRegisterId || undefined,
      sunat_problems: onlySunatProblems || undefined,
      page: page + 1,
    }),
    [search, docType, statusFilter, paymentFilter, dateFrom, dateTo, cashRegisterId, onlySunatProblems, page]
  );

  // Queries
  const { data: kpis, isLoading: isLoadingKPIs } = useInvoiceKPIs(dateFrom || undefined);
  const { data: invoiceData, isLoading: isLoadingInvoices, isFetching } = useInvoices(filters);
  const { data: registers } = useCashRegisterStatuses();

  const handleDownloadPdf = useCallback(async (invoiceId: string) => {
    const toastId = toast.loading("Generando PDF…");
    try {
      const payload = await getInvoicePdfData(invoiceId);
      if (!payload) {
        toast.error("Comprobante no encontrado", { id: toastId });
        return;
      }
      const { invoice, emisor } = payload;
      await downloadComprobantePdf({
        emisor,
        comprobante: {
          documentType: invoice.document_type as DocumentType,
          seriesCode: invoice.series_code,
          correlative: invoice.correlative_number,
          issueDate: invoice.created_at || invoice.issue_date,
          currency: invoice.currency,
          paymentMethod: invoice.payment_method ?? "cash",
          referenceDoc: null,
          referenceReason: invoice.reference_reason,
          hashCode: invoice.hash_code,
          cashierName: invoice.cashier_name,
          branchName: invoice.branch_name,
        },
        customer: invoice.customer_name
          ? {
              name: invoice.customer_name,
              docType: invoice.customer_document_type ?? "sin_documento",
              docNumber: invoice.customer_document_number ?? "",
              address: invoice.customer_address ?? null,
            }
          : null,
        items: invoice.items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unit_price),
          discountAmount: Number(it.discount_amount),
          total: Number(it.total),
          isCortesia: it.is_cortesia,
        })),
        totals: {
          opGravada: Number(invoice.op_gravada),
          opExonerada: Number(invoice.op_exonerada),
          opInafecta: Number(invoice.op_inafecta),
          igvTotal: Number(invoice.igv_total),
          discountTotal: Number(invoice.discount_total),
          total: Number(invoice.total),
        },
      });
      toast.success("PDF descargado", { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al generar PDF";
      toast.error(msg, { id: toastId });
    }
  }, []);

  /**
   * Reenvía a SUNAT un comprobante atascado.
   *
   * Hasta ahora el único rescate manual estaba en el POS, así que un comprobante
   * que agotó los cinco reintentos automáticos dependía de que un cajero abriera
   * caja y se fijara en un icono. Desde el ERP es una decisión contable.
   */
  const handleRetrySunat = useCallback(
    async (invoiceId: string) => {
      const toastId = toast.loading("Reenviando a SUNAT…");
      try {
        const result = await retrySunatFromErp(invoiceId);
        if (result.success) {
          toast.success(
            result.responseDesc || "El comprobante se envió a SUNAT.",
            { id: toastId },
          );
        } else {
          toast.error(result.error || "SUNAT rechazó el comprobante", { id: toastId });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al reenviar", {
          id: toastId,
        });
      } finally {
        await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      }
    },
    [queryClient],
  );

  /**
   * Consulta ya los tickets de anulación pendientes, sin esperar a que un POS haga
   * su pull. Es el botón manual del único reloj que existe (no hay cron en Vercel).
   */
  const handleCheckVoidTickets = useCallback(async () => {
    const toastId = toast.loading("Consultando SUNAT…");
    try {
      const result = await checkPendingVoidTickets();
      if (!result.success) {
        toast.error(result.error, { id: toastId });
        return;
      }
      if (result.checked === 0) {
        toast.info("No hay anulaciones esperando respuesta de SUNAT.", { id: toastId });
      } else {
        toast.success(
          `Consultados ${result.checked}: ${result.accepted} aceptadas, ` +
            `${result.rejected} rechazadas, ${result.stillPending} aún en proceso.`,
          { id: toastId },
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al consultar", {
        id: toastId,
      });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    }
  }, [queryClient]);

  const columns = useMemo(
    () =>
      getInvoiceColumns(
        (id) => setDetailId(id),
        handleDownloadPdf,
        handleRetrySunat,
        handleCheckVoidTickets
      ),
    [handleDownloadPdf, handleRetrySunat, handleCheckVoidTickets]
  );

  const totalPages = invoiceData
    ? Math.ceil(invoiceData.total / PAGE_SIZE)
    : 0;

  /**
   * Comprobantes que agotaron los reintentos. Se cuenta sobre la página cargada:
   * es un aviso, no un informe, y basta para que nadie tenga que ir a buscarlo.
   */
  const stuckCount = (invoiceData?.data ?? []).filter(isSunatStuck).length;
  const pendingVoidCount = (invoiceData?.data ?? []).filter(
    (i) => i.sunat_ticket_status === "pending"
  ).length;

  /**
   * Rechazos que no hablan del comprobante sino de las credenciales del emisor.
   *
   * Van en su propio aviso, por encima del dead-letter, porque son de otra
   * naturaleza: no afectan a un comprobante sino a TODOS a la vez, no se arreglan
   * reintentando, y lo que hay que tocar no está en el ERP. Se agrupan por código
   * —da igual que sean tres o trescientos, el problema es uno— y se muestra el
   * remedio concreto en vez de un "revisa la configuración".
   */
  const authFaults = useMemo(() => {
    const porCodigo = new Map<string, number>();
    for (const inv of invoiceData?.data ?? []) {
      if (!isProviderAuthFault(inv.sunat_response_code)) continue;
      const code = extractSunatCode(inv.sunat_response_code);
      if (code) porCodigo.set(code, (porCodigo.get(code) ?? 0) + 1);
    }
    return [...porCodigo.entries()].map(([code, count]) => ({ code, count }));
  }, [invoiceData?.data]);

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

        <button
          type="button"
          onClick={() => setOnlySunatProblems((v) => !v)}
          aria-pressed={onlySunatProblems}
          title="Comprobantes que agotaron los reintentos automáticos o cuya anulación espera respuesta de SUNAT"
          className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
            onlySunatProblems
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-input text-muted-foreground hover:bg-accent"
          }`}
        >
          <TriangleAlert className="size-3.5" />
          Con problemas SUNAT
        </button>

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

      {/* La emisión está caída para TODOS los comprobantes: SUNAT rechaza al
          emisor, no al documento. Va antes que el resto de avisos porque mientras
          esto siga así, lo demás es ruido. */}
      {authFaults.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="space-y-2">
              <p className="font-medium text-destructive">
                SUNAT está rechazando las credenciales del emisor. No se puede emitir
                ningún comprobante hasta corregirlo.
              </p>
              {authFaults.map(({ code, count }) => (
                <div key={code} className="space-y-1">
                  <p className="text-foreground">
                    <span className="font-mono text-xs">{code}</span>{" "}
                    {SUNAT_AUTH_FAULTS[code] ?? "Error de credenciales"} —{" "}
                    <strong>{count}</strong>{" "}
                    {count === 1 ? "comprobante afectado" : "comprobantes afectados"}
                  </p>
                  {SUNAT_AUTH_FAULT_REMEDY[code] && (
                    <p className="text-xs text-muted-foreground">
                      {SUNAT_AUTH_FAULT_REMEDY[code]}
                    </p>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                No hace falta reintentar a mano: en cuanto se corrija, el sistema los
                reenvía solo. Puedes comprobar el estado en Configuración › POI Fact,
                con el botón «Verificar» — es una consulta y no emite nada.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Comprobantes que necesitan una decisión humana.
          El dead-letter y el ticket pendiente no tenían ninguna superficie: el
          primero se quedaba en `issued` para siempre y el segundo en `pending`. */}
      {(stuckCount > 0 || pendingVoidCount > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-amber-600" />
          <div className="flex-1 space-y-0.5">
            {stuckCount > 0 && (
              <p className="text-foreground">
                <strong>{stuckCount}</strong>{" "}
                {stuckCount === 1 ? "comprobante agotó" : "comprobantes agotaron"} los
                reintentos automáticos a SUNAT. El reenvío automático ya no los toma:
                usa «Reintentar SUNAT» en cada fila.
              </p>
            )}
            {pendingVoidCount > 0 && (
              <p className="text-muted-foreground">
                <strong>{pendingVoidCount}</strong>{" "}
                {pendingVoidCount === 1 ? "anulación espera" : "anulaciones esperan"} la
                respuesta de SUNAT al ticket del resumen.
              </p>
            )}
          </div>
          {pendingVoidCount > 0 && (
            <button
              type="button"
              onClick={handleCheckVoidTickets}
              className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10"
            >
              Consultar ahora
            </button>
          )}
        </div>
      )}

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
