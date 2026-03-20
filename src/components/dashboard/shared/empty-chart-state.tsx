import { BarChart3 } from "lucide-react";

interface EmptyChartStateProps {
  message?: string;
  height?: number;
}

export function EmptyChartState({
  message = "Sin datos para el periodo seleccionado",
  height = 300,
}: EmptyChartStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
      style={{ height }}
    >
      <BarChart3 className="h-10 w-10 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
