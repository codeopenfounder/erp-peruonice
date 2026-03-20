"use client";

import { PageHeader } from "@/components/ui/page-header";
import { SupplyForm } from "@/components/inventario/supply-form";

export default function NuevoInsumoPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo insumo" description="Registra una nueva materia prima o insumo" />
      <div className="mx-auto max-w-2xl">
        <SupplyForm />
      </div>
    </div>
  );
}
