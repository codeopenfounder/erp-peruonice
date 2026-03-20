"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const VARIANT_STYLES: Record<string, { icon: string; border: string }> = {
  primary: { icon: "bg-primary/10 text-primary", border: "border-primary/20" },
  success: { icon: "bg-success/10 text-success", border: "border-success/20" },
  danger: { icon: "bg-destructive/10 text-destructive", border: "border-destructive/20" },
  warning: { icon: "bg-warning/10 text-warning", border: "border-warning/20" },
  accent: { icon: "bg-accent/10 text-accent", border: "border-accent/20" },
  default: { icon: "bg-muted text-muted-foreground", border: "" },
};

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  variant?: keyof typeof VARIANT_STYLES;
  prevValue?: number;
  currentValue?: number;
  className?: string;
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  variant = "default",
  prevValue,
  currentValue,
  className,
}: MetricCardProps) {
  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;

  let trendPct: number | null = null;
  let TrendIcon = Minus;
  let trendColor = "text-muted-foreground";

  if (prevValue !== undefined && currentValue !== undefined && prevValue > 0) {
    trendPct = ((currentValue - prevValue) / prevValue) * 100;
    if (trendPct > 0) {
      TrendIcon = TrendingUp;
      trendColor = "text-success";
    } else if (trendPct < 0) {
      TrendIcon = TrendingDown;
      trendColor = "text-destructive";
    }
  }

  return (
    <Card className={cn("py-4", styles.border, className)}>
      <CardContent className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            styles.icon
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold tracking-tight text-foreground">
              {value}
            </p>
            {trendPct !== null && (
              <span className={cn("flex items-center gap-0.5 text-xs font-medium", trendColor)}>
                <TrendIcon className="h-3 w-3" />
                {Math.abs(trendPct).toFixed(1)}%
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
