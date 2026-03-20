"use client";

import { use } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductForm } from "@/components/inventario/product-form";
import { useProduct } from "@/hooks/queries/use-products";

export default function EditarProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: product, isLoading } = useProduct(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!product) {
    return <p className="py-12 text-center text-muted-foreground">Producto no encontrado</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Editar: ${product.name}`}
        description={`SKU: ${product.sku}`}
      />
      <div className="mx-auto max-w-2xl">
        <ProductForm product={product} type={product.type} />
      </div>
    </div>
  );
}
