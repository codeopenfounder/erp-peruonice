"use client";

import { PageHeader } from "@/components/ui/page-header";
import { PromotionForm } from "@/components/inventario/promotion-form";

export default function NuevaPromocionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva promoción"
        description="Configura una nueva promoción o descuento"
      />
      <div className="mx-auto max-w-2xl">
        <PromotionForm />
      </div>
    </div>
  );
}
