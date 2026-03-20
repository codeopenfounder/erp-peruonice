"use client";

import { useRef } from "react";
import { Package, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import { DECIMAL_UNITS } from "@/lib/constants/sunat";
import type { AuditRow } from "@/types/inventory-audit";

interface AuditSpreadsheetProps {
  rows: AuditRow[];
  onChange: (entityId: string, physicalStock: number) => void;
}

export function AuditSpreadsheet({ rows, onChange }: AuditSpreadsheetProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      const nextInput = inputRefs.current[index + 1];
      nextInput?.focus();
      nextInput?.select();
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">
              Tipo
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              SKU
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Nombre
            </th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground hidden md:table-cell">
              Teorico
            </th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">
              Fisico
            </th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">
              Diferencia
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const hasCounted = row.physical_stock !== null;
            const diff = hasCounted
              ? (row.physical_stock as number) - row.theoretical_stock
              : 0;

            return (
              <tr
                key={row.entity_id}
                className="border-b border-border/50 even:bg-muted/5"
              >
                <td className="px-3 py-1.5">
                  {row.entity_type === "product" ? (
                    <Package className="size-4 text-muted-foreground" />
                  ) : (
                    <Warehouse className="size-4 text-muted-foreground" />
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                  {row.entity_sku}
                </td>
                <td className="px-3 py-1.5 font-medium truncate max-w-[200px]">
                  {row.entity_name}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums hidden md:table-cell">
                  {Number.isInteger(row.theoretical_stock) ? row.theoretical_stock : row.theoretical_stock.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="number"
                    min={0}
                    step={DECIMAL_UNITS.has(row.unit_of_measure) ? "any" : "1"}
                    value={row.physical_stock ?? ""}
                    placeholder="\u2014"
                    onChange={(e) => {
                      const val =
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value);
                      if (val !== null && !isNaN(val))
                        onChange(row.entity_id, val);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  />
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums font-semibold transition-colors duration-200",
                    !hasCounted
                      ? "text-muted-foreground/30"
                      : diff === 0
                        ? "text-muted-foreground"
                        : diff < 0
                          ? "text-destructive"
                          : "text-amber-400"
                  )}
                >
                  {hasCounted
                    ? diff > 0
                      ? `+${Number.isInteger(diff) ? diff : diff.toFixed(2)}`
                      : Number.isInteger(diff) ? String(diff) : diff.toFixed(2)
                    : "\u2014"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
