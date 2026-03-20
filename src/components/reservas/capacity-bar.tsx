"use client";

import { cn } from "@/lib/utils";

interface CapacityBarProps {
  booked: number;
  capacity: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

function getBarColor(percent: number): string {
  if (percent > 80) return "bg-destructive";
  if (percent >= 50) return "bg-warning";
  return "bg-success";
}

export function CapacityBar({
  booked,
  capacity,
  size = "sm",
  showLabel = true,
  className,
}: CapacityBarProps) {
  const percent = capacity > 0 ? Math.min((booked / capacity) * 100, 100) : 0;
  const colorClass = getBarColor(percent);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-2" : "h-4"
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-300",
            colorClass
          )}
          style={{ width: `${percent}%` }}
        >
          {size === "md" && (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white">
              {percent >= 15 ? `${Math.round(percent)}%` : ""}
            </span>
          )}
        </div>
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {booked}/{capacity}
        </span>
      )}
    </div>
  );
}
