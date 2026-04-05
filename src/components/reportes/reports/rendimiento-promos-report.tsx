"use client"

import { useState, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileSpreadsheet, FileText, Loader2, Search } from "lucide-react"
import { format, startOfMonth } from "date-fns"
import { toast } from "sonner"
import { useReporteRendimientoPromos } from "@/hooks/queries/use-reportes"
import { ReportPreviewTable } from "../report-preview-table"
import { exportFlatData } from "@/lib/utils/export-flat"
import type { ReportFilters } from "@/types/reportes"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const COLUMNS = [
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Hora", key: "hora", width: 8 },
  { header: "Promoción", key: "nombre_promo", width: 24 },
  { header: "Código", key: "codigo_promo", width: 14 },
  { header: "Tipo Descuento", key: "tipo_descuento", width: 14 },
  { header: "Valor Descuento", key: "valor_descuento", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Monto Descontado (S/)", key: "monto_descontado", width: 18, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Ingreso Real (S/)", key: "ingreso_real", width: 16, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Comprobante", key: "comprobante", width: 20 },
]

export function RendimientoPromosReport({ open, onOpenChange }: Props) {
  const now = new Date()
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(now, "yyyy-MM-dd"))
  const [generated, setGenerated] = useState(false)

  const filters = useMemo<ReportFilters>(
    () => ({ date_from: dateFrom, date_to: dateTo }),
    [dateFrom, dateTo]
  )

  const { data, isLoading, isFetching } = useReporteRendimientoPromos(filters, generated && open)

  const handleGenerate = () => {
    if (!dateFrom || !dateTo) { toast.error("Selecciona un rango de fechas"); return }
    setGenerated(true)
  }

  const handleExport = async (fmt: "xlsx" | "csv") => {
    if (!data || data.length === 0) { toast.error("No hay datos para exportar"); return }
    try {
      await exportFlatData({
        filename: `rendimiento-promos-${dateFrom}-a-${dateTo}`,
        sheetName: "Promociones",
        reportTitle: "Rendimiento de Promociones y Cupones",
        dateRange: { from: dateFrom, to: dateTo },
        columns: COLUMNS,
        data: data as unknown as Record<string, unknown>[],
        format: fmt,
      })
      toast.success(`Reporte exportado como ${fmt.toUpperCase()}`)
    } catch { toast.error("Error al exportar el reporte") }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) setGenerated(false)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="text-lg">Rendimiento de Promociones</DialogTitle>
          <DialogDescription>
            Uso de promociones y cupones con monto descontado e ingreso real.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Desde</label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setGenerated(false) }} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Hasta</label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setGenerated(false) }} className="w-[150px]" />
            </div>
            <Button onClick={handleGenerate} disabled={isLoading || isFetching}>
              {isLoading || isFetching ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
              Generar
            </Button>
          </div>

          {generated && (
            <ReportPreviewTable columns={COLUMNS} data={(data ?? []) as unknown as Record<string, unknown>[]} isLoading={isLoading} />
          )}
        </div>

        {generated && data && data.length > 0 && (
          <div className="flex items-center justify-between border-t border-border/50 px-6 py-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">{data.length} registro{data.length !== 1 ? "s" : ""}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")}><FileText className="mr-2 size-3.5" />CSV</Button>
              <Button size="sm" onClick={() => handleExport("xlsx")}><FileSpreadsheet className="mr-2 size-3.5" />Excel</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
