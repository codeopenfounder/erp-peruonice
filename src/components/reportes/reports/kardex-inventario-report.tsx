"use client"

import { useState, useMemo, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileSpreadsheet, FileText, Loader2, Search, FileDown } from "lucide-react"
import { format, startOfMonth } from "date-fns"
import { toast } from "sonner"
import { useReporteKardexInventario } from "@/hooks/queries/use-reportes"
import { useBranchesForSelect } from "@/hooks/queries/use-branches"
import { ReportPreviewTable } from "../report-preview-table"
import { exportFlatData } from "@/lib/utils/export-flat"
import { exportTableToPdf } from "@/lib/utils/export-pdf"
import type { ReportFilters } from "@/types/reportes"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const fmtQty = (v: unknown) => {
  const n = Number(v || 0)
  return n === 0 ? "-" : n.toFixed(2)
}
const fmtMoney = (v: unknown) => Number(v || 0).toFixed(2)

const COLUMNS = [
  { header: "Tipo", key: "tipo", width: 10 },
  { header: "SKU", key: "sku", width: 12 },
  { header: "Nombre", key: "nombre", width: 24 },
  { header: "Categoria", key: "categoria", width: 14 },
  { header: "Venta", key: "qty_venta", width: 9, format: fmtQty },
  { header: "Cortesia", key: "qty_cortesia", width: 9, format: fmtQty },
  { header: "Merma", key: "qty_merma", width: 9, format: fmtQty },
  { header: "Perdida", key: "qty_perdida", width: 9, format: fmtQty },
  { header: "Rotura", key: "qty_rotura", width: 9, format: fmtQty },
  { header: "Cons. Staff", key: "qty_consumo_staff", width: 10, format: fmtQty },
  { header: "Ajuste", key: "qty_ajuste", width: 9, format: fmtQty },
  { header: "Transfer.", key: "qty_transferencia", width: 10, format: fmtQty },
  { header: "NC Retorno", key: "qty_nc_retorno", width: 10, format: fmtQty },
  { header: "Ingreso", key: "qty_ingreso", width: 9, format: fmtQty },
  { header: "Salida", key: "qty_salida", width: 9, format: fmtQty },
  { header: "Neto Mov.", key: "total_movimientos", width: 10, format: fmtQty },
  { header: "Stock Teorico", key: "stock_teorico", width: 11, format: fmtQty },
  { header: "Stock Fisico", key: "stock_fisico", width: 11, format: (v: unknown) => {
    const n = Number(v || 0)
    return n < 0 ? "Sin conteo" : n.toFixed(2)
  }},
  { header: "Diferencia", key: "diferencia", width: 10, format: fmtQty },
  { header: "Ultimo Conteo", key: "fecha_ultimo_conteo", width: 12 },
  { header: "Costo Unit. (S/)", key: "costo_unitario", width: 12, format: fmtMoney },
  { header: "Valor Stock (S/)", key: "valor_stock", width: 12, format: fmtMoney },
]

export function KardexInventarioReport({ open, onOpenChange }: Props) {
  const now = new Date()
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(now, "yyyy-MM-dd"))
  const [branchId, setBranchId] = useState("all")
  const [entityType, setEntityType] = useState("all")
  const [generated, setGenerated] = useState(false)

  const filters = useMemo<ReportFilters>(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      branch_id: branchId !== "all" ? branchId : undefined,
      entity_type: entityType !== "all" ? entityType : undefined,
    }),
    [dateFrom, dateTo, branchId, entityType]
  )

  const { data, isLoading, isFetching } = useReporteKardexInventario(filters, generated && open)
  const { data: branches } = useBranchesForSelect()

  const handleGenerate = () => {
    if (!dateFrom || !dateTo) {
      toast.error("Selecciona un rango de fechas")
      return
    }
    setGenerated(true)
  }

  const handleExport = useCallback(async (fmt: "xlsx" | "csv" | "pdf") => {
    if (!data || data.length === 0) {
      toast.error("No hay datos para exportar")
      return
    }
    const filename = `kardex-inventario-${dateFrom}-a-${dateTo}`
    const exportData = data as unknown as Record<string, unknown>[]

    try {
      if (fmt === "pdf") {
        await exportTableToPdf({
          filename,
          reportTitle: "Kardex de Inventario",
          dateRange: { from: dateFrom, to: dateTo },
          columns: COLUMNS,
          data: exportData,
        })
      } else {
        await exportFlatData({
          filename,
          sheetName: "Kardex",
          reportTitle: "Kardex de Inventario",
          dateRange: { from: dateFrom, to: dateTo },
          columns: COLUMNS,
          data: exportData,
          format: fmt,
        })
      }
      toast.success(`Reporte exportado como ${fmt.toUpperCase()}`)
    } catch {
      toast.error("Error al exportar el reporte")
    }
  }, [data, dateFrom, dateTo])

  const handleOpenChange = (next: boolean) => {
    if (!next) setGenerated(false)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="text-lg">Kardex de Inventario</DialogTitle>
          <DialogDescription>
            Desglose de movimientos por producto: ventas, mermas, cortesias, ajustes y mas. Incluye stock teorico vs fisico.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setGenerated(false) }}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Hasta</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setGenerated(false) }}
                className="w-[150px]"
              />
            </div>
            {branches && branches.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Sede</label>
                <Select value={branchId} onValueChange={(v) => { setBranchId(v); setGenerated(false) }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las sedes</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select value={entityType} onValueChange={(v) => { setEntityType(v); setGenerated(false) }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="product">Productos</SelectItem>
                  <SelectItem value="supply">Insumos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={isLoading || isFetching}>
              {isLoading || isFetching ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Search className="mr-2 size-4" />
              )}
              Generar
            </Button>
          </div>

          {/* Preview */}
          {generated && (
            <ReportPreviewTable
              columns={COLUMNS}
              data={(data ?? []) as unknown as Record<string, unknown>[]}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* Export Footer */}
        {generated && data && data.length > 0 && (
          <div className="flex items-center justify-between border-t border-border/50 px-6 py-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              {data.length} registro{data.length !== 1 ? "s" : ""} listo{data.length !== 1 ? "s" : ""} para exportar
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
                <FileText className="mr-2 size-3.5" />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
                <FileDown className="mr-2 size-3.5" />
                PDF
              </Button>
              <Button size="sm" onClick={() => handleExport("xlsx")}>
                <FileSpreadsheet className="mr-2 size-3.5" />
                Excel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
