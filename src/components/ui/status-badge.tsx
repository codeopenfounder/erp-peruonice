import * as React from "react";
import { cn } from "@/lib/utils";

const STATUS_VARIANTS: Record<string, { label: string; className: string }> = {
  active: {
    label: "Activo",
    className: "bg-success/10 text-success border-success/20",
  },
  inactive: {
    label: "Inactivo",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  draft: {
    label: "Borrador",
    className: "bg-muted text-muted-foreground border-border",
  },
  calculated: {
    label: "Calculado",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  approved: {
    label: "Aprobado",
    className: "bg-success/10 text-success border-success/20",
  },
  paid: {
    label: "Pagado",
    className: "bg-success/10 text-success border-success/20",
  },
  closed: {
    label: "Cerrado",
    className: "bg-muted text-muted-foreground border-border",
  },
  pending: {
    label: "Pendiente",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  rejected: {
    label: "Rechazado",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-muted text-muted-foreground border-border",
  },
  pending_supervisor: {
    label: "Pendiente Supervisor",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  pending_rrhh: {
    label: "Pendiente RRHH",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  pending_manager: {
    label: "Pendiente Gerencia",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  present: {
    label: "Presente",
    className: "bg-success/10 text-success border-success/20",
  },
  absent: {
    label: "Ausente",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  tardiness: {
    label: "Tardanza",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  leave: {
    label: "Permiso",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  late: {
    label: "Tardanza",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  rest_day: {
    label: "Descanso",
    className: "bg-muted text-muted-foreground border-border",
  },
  holiday: {
    label: "Feriado",
    className: "bg-accent/10 text-accent border-accent/20",
  },
  indefinite: {
    label: "Indefinido",
    className: "bg-success/10 text-success border-success/20",
  },
  fixed_term: {
    label: "Plazo Fijo",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  part_time: {
    label: "Parcial",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  training: {
    label: "Formacion",
    className: "bg-accent/10 text-accent border-accent/20",
  },
  service: {
    label: "Servicio",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export interface StatusBadgeProps {
  status: string;
  customLabel?: string;
  className?: string;
}

export function StatusBadge({ status, customLabel, className }: StatusBadgeProps) {
  const variant = STATUS_VARIANTS[status];
  const label = customLabel ?? variant?.label ?? status;
  const variantClassName =
    variant?.className ?? "bg-muted text-muted-foreground border-border";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClassName,
        className
      )}
    >
      {label}
    </span>
  );
}
