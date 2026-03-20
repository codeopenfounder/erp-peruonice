"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  children: ReactNode;
  isLoading?: boolean;
  isFetching?: boolean;
  isEmpty?: boolean;
  height?: number;
  action?: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  children,
  isLoading,
  isFetching,
  isEmpty,
  height = 300,
  action,
  className,
}: ChartCardProps) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="w-full rounded-lg" style={{ height }} />
        ) : isEmpty ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            Sin datos para el periodo seleccionado
          </div>
        ) : (
          <div className="relative">
            {isFetching && (
              <div className="absolute inset-0 z-10 rounded-lg bg-background/50 animate-pulse" />
            )}
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
