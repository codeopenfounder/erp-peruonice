"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/inventario/product-form";

export default function NuevoProductoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo producto"
        description="Registra un nuevo producto en el inventario"
      />
      <div className="mx-auto max-w-2xl">
        <ProductForm type="product" />
      </div>
    </div>
  );
}
