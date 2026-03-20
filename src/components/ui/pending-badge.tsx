import { cn } from "@/lib/utils";

type PendingVariant = "create" | "delete" | "update";

interface PendingBadgeProps {
  variant?: PendingVariant;
  label?: string;
  className?: string;
}

const VARIANT_STYLES = {
  create: {
    wrapper: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    dot: "bg-amber-400",
    defaultLabel: "Pendiente",
  },
  delete: {
    wrapper: "border-red-500/30 bg-red-500/10 text-red-400",
    dot: "bg-red-400",
    defaultLabel: "Pendiente de eliminacion",
  },
  update: {
    wrapper: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    dot: "bg-blue-400",
    defaultLabel: "Edicion pendiente",
  },
};

export function PendingBadge({
  variant = "create",
  label,
  className,
}: PendingBadgeProps) {
  const v = VARIANT_STYLES[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        v.wrapper,
        className
      )}
    >
      <span className="relative flex size-1.5">
        <span
          className={cn(
            "animate-ping absolute inline-flex size-full rounded-full opacity-75",
            v.dot
          )}
        />
        <span className={cn("relative inline-flex size-1.5 rounded-full", v.dot)} />
      </span>
      {label ?? v.defaultLabel}
    </span>
  );
}
