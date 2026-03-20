"use client";

import { PageHeader } from "@/components/ui/page-header";
import { MovementForm } from "@/components/inventario/movement-form";

export default function NuevoMovimientoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nuevo movimiento"
        description="Registra un movimiento de inventario (merma, perdida, ajuste, etc.)"
      />
      <div className="mx-auto max-w-2xl">
        <MovementForm />
      </div>
    </div>
  );
}
