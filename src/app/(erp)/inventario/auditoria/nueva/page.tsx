"use client";

import { PageHeader } from "@/components/ui/page-header";
import { AuditForm } from "@/components/inventario/audit-form";

export default function NuevaAuditoriaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva auditoria"
        description="Compara el stock del sistema con el inventario fisico"
      />
      <AuditForm />
    </div>
  );
}
