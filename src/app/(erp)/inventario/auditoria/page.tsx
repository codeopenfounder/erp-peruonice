"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  Calendar,
  ClipboardCheck,
  Plus,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAudits, useAuditKPIs } from "@/hooks/queries/use-inventory-audits";
import { useBranchesForSelect } from "@/hooks/queries/use-branches";
import { getAuditColumns } from "@/components/inventario/audit-columns";
import { usePermissions } from "@/hooks/use-permissions";
import type { AuditFilters } from "@/types/inventory-audit";

const PAGE_SIZE = 50;

export default function AuditoriaPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      }
    >
      <AuditoriaPage />
    </Suspense>
  );
}

function AuditoriaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canCreate } = usePermissions();

  const [branchId, setBranchId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [branchId, status]);

  const filters = useMemo<AuditFilters>(
    () => ({
      branch_id: branchId !== "all" ? branchId : undefined,
      status: status !== "all" ? (status as AuditFilters["status"]) : undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
    }),
    [branchId, status, page]
  );

  const { data: auditData, isLoading, isFetching } = useAudits(filters);
  const { data: kpis, isLoading: isLoadingKPIs } = useAuditKPIs();
  const { data: branches } = useBranchesForSelect();

  const columns = useMemo(() => getAuditColumns(), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría de Inventario"
        description="Control de stock físico vs teórico"
        actions={
          canCreate("inventario.auditoria") ? (
            <Button onClick={() => router.push("/inventario/auditoria/nueva")}>
              <Plus className="mr-2 size-4" />
              Nueva auditoría
            </Button>
          ) : undefined
        }
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
            title="Auditados (30d)"
            value={kpis?.audited_last_30d ?? 0}
            description="Items auditados"
            icon={CheckCircle2}
            variant="success"
          />
          <KpiCard
            title="En Riesgo"
            value={kpis?.at_risk_count ?? 0}
            description="Sin auditar +30 dias"
            icon={AlertTriangle}
            variant="danger"
          />
          <KpiCard
            title="Última auditoría"
            value={
              kpis?.last_audit_date
                ? format(new Date(kpis.last_audit_date), "dd MMM yyyy", {
                    locale: es,
                  })
                : "Nunca"
            }
            description="Fecha mas reciente"
            icon={Calendar}
            variant="default"
          />
          <KpiCard
            title="Total auditorias"
            value={kpis?.total_audits ?? 0}
            description="Registradas"
            icon={ClipboardCheck}
            variant="primary"
          />
        </KpiGrid>
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="approved">Aprobado</SelectItem>
            <SelectItem value="rejected">Rechazado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={auditData?.data ?? []}
        manualPagination
        pageCount={auditData?.totalPages ?? 0}
        pageIndex={page}
        onPageChange={setPage}
        totalRows={auditData?.total ?? 0}
        isFetching={isFetching}
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        emptyMessage="No hay auditorias registradas"
        emptyActionLabel="Crear auditoria"
        emptyActionHref="/inventario/auditoria/nueva"
      />
    </div>
  );
}
