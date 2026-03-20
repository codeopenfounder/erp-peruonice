"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/inventario/product-form";

export default function NuevoServicioPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo servicio"
        description="Registra un nuevo servicio en el catalogo"
      />
      <div className="mx-auto max-w-2xl">
        <ProductForm type="service" />
      </div>
    </div>
  );
}
