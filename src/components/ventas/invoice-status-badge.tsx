import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Borrador",
    className: "bg-muted text-muted-foreground border-border",
  },
  issued: {
    label: "Emitido",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  sent_to_sunat: {
    label: "Enviado SUNAT",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  accepted: {
    label: "Aceptado",
    className: "bg-success/10 text-success border-success/20",
  },
  rejected: {
    label: "Rechazado",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  voided: {
    label: "Anulado",
    className: "bg-muted text-muted-foreground border-border",
  },
  pending_void: {
    label: "Anulacion pendiente",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
};

export interface InvoiceStatusBadgeProps {
  status: string;
  className?: string;
}

export function InvoiceStatusBadge({ status, className }: InvoiceStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
