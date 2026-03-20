"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { RegisterStatusGrid } from "@/components/contabilidad/register-status-grid";
import { useCashRegisterStatuses } from "@/hooks/queries/use-gastos";

export default function CajaPage() {
  const { data: registers, isLoading } = useCashRegisterStatuses();

  const openCount = registers?.filter((r) => r.is_open).length ?? 0;
  const totalCount = registers?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caja"
        description={
          isLoading
            ? "Cargando estado de cajas..."
            : `${openCount} caja${openCount !== 1 ? "s" : ""} abierta${openCount !== 1 ? "s" : ""} de ${totalCount}`
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
      ) : (
        <RegisterStatusGrid registers={registers ?? []} />
      )}
    </div>
  );
}
