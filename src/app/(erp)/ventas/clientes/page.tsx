"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Users,
  Building2,
  CreditCard,
  FileQuestion,
  Search,
  MonitorSmartphone,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCustomerColumns } from "@/components/ventas/customer-columns";
import {
  useCustomers,
  useCustomerKPIs,
} from "@/hooks/queries/use-ventas";
import type { CustomerFilters } from "@/types/invoice";

const PAGE_SIZE = 50;

export default function ClientesPage() {
  // Filter state
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [search, docType]);

  const filters = useMemo<CustomerFilters>(
    () => ({
      search: search || undefined,
      document_type: docType || undefined,
      page: page + 1,
    }),
    [search, docType, page]
  );

  // Queries
  const { data: kpis, isLoading: isLoadingKPIs } = useCustomerKPIs();
  const { data: customerData, isLoading: isLoadingCustomers, isFetching } = useCustomers(filters);

  const columns = useMemo(() => getCustomerColumns(), []);

  const totalPages = customerData
    ? Math.ceil(customerData.total / PAGE_SIZE)
    : 0;

  const isEmpty = !isLoadingCustomers && !isFetching && (customerData?.total ?? 0) === 0 && !search && !docType;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Directorio de clientes registrados desde POI Fact"
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
            title="Total clientes"
            value={kpis?.total ?? 0}
            description="Clientes registrados"
            icon={Users}
            variant="primary"
          />
          <KpiCard
            title="RUC"
            value={kpis?.ruc ?? 0}
            description="Empresas con RUC"
            icon={Building2}
            variant="success"
          />
          <KpiCard
            title="DNI"
            value={kpis?.dni ?? 0}
            description="Personas con DNI"
            icon={CreditCard}
            variant="default"
          />
          <KpiCard
            title="Otros"
            value={kpis?.otros ?? 0}
            description="CE, pasaporte u otros"
            icon={FileQuestion}
            variant="warning"
          />
        </KpiGrid>
      )}

      {/* Empty state when no customers exist at all */}
      {isEmpty ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="Sin clientes registrados"
          description="Los clientes se crean automaticamente desde POI Fact (POS) al emitir comprobantes con datos del cliente."
        />
      ) : (
        <>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, documento..."
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
                <SelectItem value="ruc">RUC</SelectItem>
                <SelectItem value="dni">DNI</SelectItem>
                <SelectItem value="ce">CE</SelectItem>
                <SelectItem value="passport">Pasaporte</SelectItem>
                <SelectItem value="sin_documento">Sin documento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data Table */}
          <DataTable
            columns={columns}
            data={customerData?.data ?? []}
            manualPagination
            pageCount={totalPages}
            pageIndex={page}
            onPageChange={setPage}
            totalRows={customerData?.total ?? 0}
            isFetching={isFetching}
            isLoading={isLoadingCustomers}
            pageSize={PAGE_SIZE}
            emptyMessage="No se encontraron clientes con los filtros seleccionados"
          />
        </>
      )}
    </div>
  );
}
