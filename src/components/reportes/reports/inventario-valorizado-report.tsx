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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileSpreadsheet, FileText, Loader2, Search } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"
import { useReporteInventarioValorizado } from "@/hooks/queries/use-reportes"
import { useBranchesForSelect } from "@/hooks/queries/use-branches"
import { ReportPreviewTable } from "../report-preview-table"
import { exportFlatData } from "@/lib/utils/export-flat"
import type { ReportFilters } from "@/types/reportes"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const COLUMNS = [
  { header: "Tipo", key: "tipo", width: 12 },
  { header: "SKU", key: "sku", width: 14 },
  { header: "Nombre", key: "nombre", width: 28 },
  { header: "Categoria", key: "categoria", width: 18 },
  { header: "Stock Actual", key: "stock_actual", width: 12, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Stock Minimo", key: "stock_minimo", width: 12, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Costo Unit. (S/)", key: "costo_unitario", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Valor Total (S/)", key: "valor_total", width: 14, format: (v: unknown) => Number(v || 0).toFixed(2) },
  { header: "Estado", key: "estado_stock", width: 10 },
]

export function InventarioValorizadoReport({ open, onOpenChange }: Props) {
  const [branchId, setBranchId] = useState("all")
  const [generated, setGenerated] = useState(false)

  const filters = useMemo<ReportFilters>(
    () => ({
      date_from: format(new Date(), "yyyy-MM-dd"),
      date_to: format(new Date(), "yyyy-MM-dd"),
      branch_id: branchId !== "all" ? branchId : undefined,
    }),
    [branchId]
  )

  const { data, isLoading, isFetching } = useReporteInventarioValorizado(filters, generated && open)
  const { data: branches } = useBranchesForSelect()

  const handleGenerate = () => setGenerated(true)

  const handleExport = async (fmt: "xlsx" | "csv") => {
    if (!data || data.length === 0) { toast.error("No hay datos para exportar"); return }
    const today = format(new Date(), "yyyy-MM-dd")
    try {
      await exportFlatData({
        filename: `inventario-valorizado-${today}`,
        sheetName: "Inventario",
        reportTitle: "Inventario Valorizado - Snapshot Actual",
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
          <DialogTitle className="text-lg">Inventario Valorizado</DialogTitle>
          <DialogDescription>
            Snapshot actual del stock con costos y valor total del inventario.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {branches && branches.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Sede</label>
                <Select value={branchId} onValueChange={(v) => { setBranchId(v); setGenerated(false) }}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las sedes</SelectItem>
                    {branches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
