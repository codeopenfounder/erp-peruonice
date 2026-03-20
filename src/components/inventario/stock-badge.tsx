import { cn } from "@/lib/utils";

interface StockBadgeProps {
  quantity: number;
  minStock: number | null;
  type: "product" | "service";
}

export function StockBadge({ quantity, minStock, type }: StockBadgeProps) {
  if (type === "service") {
    return <span className="text-xs text-muted-foreground">N/A</span>;
  }

  const isOutOfStock = quantity === 0;
  const isLowStock = minStock != null && quantity > 0 && quantity <= minStock;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex h-2 w-2 rounded-full",
          isOutOfStock && "bg-destructive",
          isLowStock && "bg-warning",
          !isOutOfStock && !isLowStock && "bg-success"
        )}
      />
      <span
        className={cn(
          "text-sm tabular-nums",
          isOutOfStock && "font-medium text-destructive",
          isLowStock && "text-warning",
          !isOutOfStock && !isLowStock && "text-foreground"
        )}
      >
        {Number.isInteger(quantity) ? quantity : quantity.toFixed(2)}
      </span>
    </div>
  );
}
