"use client"

import { Skeleton } from "@/components/ui/skeleton"

interface Column {
  header: string
  key: string
  format?: (value: unknown) => string | number
}

interface ReportPreviewTableProps {
  columns: Column[]
  data: Record<string, unknown>[]
  isLoading: boolean
  maxRows?: number
}

export function ReportPreviewTable({
  columns,
  data,
  isLoading,
  maxRows = 50,
}: ReportPreviewTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">No hay datos para el rango seleccionado</p>
      </div>
    )
  }

  const preview = data.slice(0, maxRows)
  const hasMore = data.length > maxRows

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="sticky top-0 whitespace-nowrap px-3 py-2.5 text-left font-semibold text-foreground"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={`border-t border-border/50 transition-colors hover:bg-muted/30 ${rowIdx % 2 === 1 ? "bg-muted/20" : ""}`}
              >
                {columns.map((col) => {
                  const raw = row[col.key]
                  const val = col.format ? col.format(raw) : raw
                  const isNum = typeof raw === "number"
                  return (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-3 py-2 ${isNum ? "text-right font-mono tabular-nums" : ""}`}
                    >
                      {val == null ? "" : String(val)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {hasMore
          ? `Mostrando ${maxRows} de ${data.length} registros`
          : `${data.length} registro${data.length !== 1 ? "s" : ""}`}
      </p>
    </div>
  )
}
