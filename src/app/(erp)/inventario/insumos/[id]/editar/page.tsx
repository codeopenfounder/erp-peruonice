"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SupplyForm } from "@/components/inventario/supply-form";
import { useSupply } from "@/hooks/queries/use-supplies";

export default function EditarInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: supply, isLoading } = useSupply(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!supply) {
    return <p className="py-12 text-center text-muted-foreground">Insumo no encontrado</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Editar: ${supply.name}`} description={`SKU: ${supply.sku}`} />
      <div className="mx-auto max-w-2xl">
        <SupplyForm supply={supply} />
      </div>
    </div>
  );
}
