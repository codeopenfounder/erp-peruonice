import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const VARIANT_STYLES: Record<string, { icon: string; border: string }> = {
  primary: {
    icon: "bg-primary/10 text-primary",
    border: "border-primary/20",
  },
  success: {
    icon: "bg-success/10 text-success",
    border: "border-success/20",
  },
  danger: {
    icon: "bg-destructive/10 text-destructive",
    border: "border-destructive/20",
  },
  warning: {
    icon: "bg-warning/10 text-warning",
    border: "border-warning/20",
  },
  accent: {
    icon: "bg-accent/10 text-accent",
    border: "border-accent/20",
  },
  default: {
    icon: "bg-muted text-muted-foreground",
    border: "",
  },
};

export interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  variant?: keyof typeof VARIANT_STYLES;
  className?: string;
}

export function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  variant = "default",
  className,
}: KpiCardProps) {
  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;

  return (
    <Card className={cn("py-4", styles.border, className)}>
      <CardContent className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            styles.icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-xl font-bold tracking-tight text-foreground">
            {value}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
