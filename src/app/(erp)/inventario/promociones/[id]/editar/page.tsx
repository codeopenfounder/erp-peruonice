"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { PromotionForm } from "@/components/inventario/promotion-form";
import { usePromotion } from "@/hooks/queries/use-promotions";

export default function EditarPromocionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: promotion, isLoading } = usePromotion(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!promotion) {
    return <p className="py-12 text-center text-muted-foreground">Promocion no encontrada</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Editar: ${promotion.name}`}
        description={`Codigo: ${promotion.code}`}
      />
      <div className="mx-auto max-w-2xl">
        <PromotionForm promotion={promotion} />
      </div>
    </div>
  );
}
