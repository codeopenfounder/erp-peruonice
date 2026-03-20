import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface KpiGridProps {
  children: ReactNode;
  className?: string;
}

export function KpiGrid({ children, className }: KpiGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
