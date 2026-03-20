import { cn } from "@/lib/utils";
import type { PromotionStatus } from "@/types/promotion";

const STATUS_MAP: Record<PromotionStatus, { label: string; className: string }> = {
  active: {
    label: "Activa",
    className: "bg-success/10 text-success border-success/20",
  },
  scheduled: {
    label: "Programada",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  expired: {
    label: "Expirada",
    className: "bg-muted text-muted-foreground border-border",
  },
  depleted: {
    label: "Agotada",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  inactive: {
    label: "Inactiva",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

interface PromotionStatusBadgeProps {
  status: PromotionStatus;
  className?: string;
}

export function PromotionStatusBadge({ status, className }: PromotionStatusBadgeProps) {
  const variant = STATUS_MAP[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variant.className,
        className
      )}
    >
      {variant.label}
    </span>
  );
}
