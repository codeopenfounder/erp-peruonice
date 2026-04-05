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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileSpreadsheet, FileText, FileDown, Loader2, Search } from "lucide-react"
import { format, startOfMonth } from "date-fns"
import { toast } from "sonner"
import { useReporteSabanaVentas } from "@/hooks/queries/use-reportes"
import { useBranchesForSelect } from "@/hooks/queries/use-branches"
import { ReportPreviewTable } from "../report-preview-table"
import { exportFlatData } from "@/lib/utils/export-flat"
import { exportTableToPdf } from "@/lib/utils/export-pdf"
import type { ReportFilters } from "@/types/reportes"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const COLUMNS = [
  { header: "ID Transaccion", key: "id_transaccion", width: 20 },
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Hora", key: "hora", width: 8 },
  { header: "Dia", key: "dia_semana", width: 12 },
  { header: "Serie-Correlativo", key: "serie_correlativo", width: 20 },
  { header: "Tipo Comprobante", key: "tipo_comprobante", width: 16 },
  { header: "Método Pago", key: "metodo_pago", width: 14 },
  { header: "Sede", key: "sede", width: 16 },
  { header: "Caja", key: "caja", width: 14 },
  { header: "Cajero", key: "cajero", width: 18 },
  { header: "Monto Total (S/)", key: "monto_total_venta", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Costo Total (S/)", key: "costo_total_tx", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Margen Bruto (S/)", key: "margen_bruto", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
]

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "mixed", label: "Mixto" },
  { value: "credit", label: "Crédito" },
]

export function SabanaVentasReport({ open, onOpenChange }: Props) {
  const now = new Date()
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(now, "yyyy-MM-dd"))
  const [branchId, setBranchId] = useState("all")
  const [paymentMethod, setPaymentMethod] = useState("all")
  const [generated, setGenerated] = useState(false)

  const filters = useMemo<ReportFilters>(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      branch_id: branchId !== "all" ? branchId : undefined,
      payment_method: paymentMethod !== "all" ? paymentMethod : undefined,
    }),
    [dateFrom, dateTo, branchId, paymentMethod]
  )

  const { data, isLoading, isFetching } = useReporteSabanaVentas(filters, generated && open)
  const { data: branches } = useBranchesForSelect()

  const handleGenerate = () => {
    if (!dateFrom || !dateTo) {
      toast.error("Selecciona un rango de fechas")
      return
    }
    setGenerated(true)
  }

  const handleExport = async (fmt: "xlsx" | "csv" | "pdf") => {
    if (!data || data.length === 0) {
      toast.error("No hay datos para exportar")
      return
    }
    const filename = `sabana-ventas-${dateFrom}-a-${dateTo}`
    const exportData = data as unknown as Record<string, unknown>[]
    try {
      if (fmt === "pdf") {
        await exportTableToPdf({
          filename,
          reportTitle: "Sabana General de Ventas y Transacciones",
          dateRange: { from: dateFrom, to: dateTo },
          columns: COLUMNS,
          data: exportData,
        })
      } else {
        await exportFlatData({
          filename,
          sheetName: "Ventas",
          reportTitle: "Sabana General de Ventas y Transacciones",
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
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) setGenerated(false)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="text-lg">Sabana General de Ventas</DialogTitle>
          <DialogDescription>
            Data plana de todas las transacciones. Cada fila es una venta individual.
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
              <label className="text-xs font-medium text-muted-foreground">Método Pago</label>
              <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); setGenerated(false) }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {PAYMENT_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
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
