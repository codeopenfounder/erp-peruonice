"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDailyReport } from "@/hooks/queries/use-gastos";
import type { CashRegisterStatusItem, DailyReportData } from "@/types/gastos";

interface DailyReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registers: CashRegisterStatusItem[];
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  credit: "Credito",
  mixed: "Mixto",
};

const TYPE_LABELS: Record<string, string> = {
  sale: "Venta",
  income: "Ingreso",
  expense: "Retiro",
  refund: "Devolucion",
  petty_cash_in: "Fondo adicional",
};

function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--";
  }
}

function formatDateTimeFull(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--";
  }
}

// ---------------------------------------------------------------------------
// Excel Export — Reporte completo por turno
// ---------------------------------------------------------------------------
async function exportDailyReportExcel(report: DailyReportData, date: string) {
  const workbook = new ExcelJS.Workbook();
  const BRAND = "00D9F5";
  const DARK = "1E293B";
  const MUTED = "64748B";
  const SUCCESS = "16A34A";
  const DESTRUCTIVE = "DC2626";
  const BORDER: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "E2E8F0" } },
    bottom: { style: "thin", color: { argb: "E2E8F0" } },
    left: { style: "thin", color: { argb: "E2E8F0" } },
    right: { style: "thin", color: { argb: "E2E8F0" } },
  };
  const ALT = "F8FAFC";
  const COLS = 6; // Hora | Tipo | Descripcion | Monto | Comprobante | Metodo Pago

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const ws = workbook.addWorksheet("Reporte del Dia");

  // Column widths: Hora | Tipo | Descripcion | Monto | Comprobante | Metodo Pago
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 32;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 14;

  // Helpers
  const addMergedRow = (text: string, font: Partial<ExcelJS.Font>, height = 22, fill?: string) => {
    const row = ws.addRow([text]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, COLS);
    row.height = height;
    row.getCell(1).font = { name: "Calibri", ...font };
    row.getCell(1).alignment = { vertical: "middle" };
    if (fill) row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    return row;
  };

  const addKpiRow = (label: string, value: number, color?: string) => {
    const row = ws.addRow([label, "", "", value]);
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 3);
    row.height = 20;
    row.getCell(1).font = { name: "Calibri", size: 10, color: { argb: MUTED } };
    row.getCell(4).font = { name: "Calibri", size: 10, bold: true, color: { argb: color || DARK } };
    row.getCell(4).numFmt = '#,##0.00';
    row.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
  };

  // ═══════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════
  addMergedRow("REPORTE DEL DIA", { size: 16, bold: true, color: { argb: BRAND } }, 36);
  addMergedRow(dateLabel, { size: 11, color: { argb: MUTED } }, 20);

  // Register/branch info from first opening
  if (report.openings.length > 0) {
    const first = report.openings[0];
    const registerInfo = `${first.cash_register_name}${first.branch_name ? ` · ${first.branch_name}` : ""}`;
    addMergedRow(registerInfo, { size: 10, italic: true, color: { argb: MUTED } }, 18);
  }
  ws.addRow([]);

  // ═══════════════════════════════════════════
  // RESUMEN GENERAL
  // ═══════════════════════════════════════════
  addMergedRow("RESUMEN GENERAL", { size: 12, bold: true, color: { argb: "FFFFFF" } }, 26, DARK);

  addKpiRow("Ventas efectivo", report.totals.total_sales);
  addKpiRow("Ingresos", report.totals.total_cash_in, SUCCESS);
  addKpiRow("Egresos", report.totals.total_cash_out, DESTRUCTIVE);
  addKpiRow("Devoluciones", report.totals.total_refunds);
  addKpiRow("Turnos", report.openings.length);

  // Sales by payment
  if (Object.keys(report.sales_by_payment).length > 0) {
    ws.addRow([]);
    addMergedRow("Ventas por metodo de pago", { size: 10, bold: true, color: { argb: MUTED } }, 20);
    Object.entries(report.sales_by_payment).forEach(([method, total]) => {
      addKpiRow(PAYMENT_LABELS[method] || method, total);
    });
  }

  ws.addRow([]);

  // ═══════════════════════════════════════════
  // DETALLE POR TURNO
  // ═══════════════════════════════════════════
  // Group movements by opening_id
  const movsByOpening: Record<string, typeof report.movements> = {};
  for (const m of report.movements) {
    const key = m.opening_id || "__no_opening__";
    if (!movsByOpening[key]) movsByOpening[key] = [];
    movsByOpening[key].push(m);
  }

  report.openings.forEach((o, turnoIdx) => {
    // ── Turno header ──
    const turnoRow = addMergedRow(
      `TURNO ${turnoIdx + 1} — ${o.opened_by_name || "Sin cajero"}`,
      { size: 12, bold: true, color: { argb: "FFFFFF" } },
      28,
      BRAND,
    );
    turnoRow.getCell(1).alignment = { vertical: "middle" };

    // Turno meta
    const openTime = o.opened_at ? formatDateTimeFull(o.opened_at) : "—";
    const closeTime = o.closed_at ? formatDateTimeFull(o.closed_at) : "En curso";
    addMergedRow(`Apertura: ${openTime}  |  Cierre: ${closeTime}  |  Fondo: S/ ${o.opening_amount.toFixed(2)}`, { size: 9, color: { argb: MUTED } }, 18);

    // Movement table header
    const hdr = ws.addRow(["Hora", "Tipo", "Descripcion", "Monto", "Comprobante", "Metodo Pago"]);
    hdr.height = 22;
    hdr.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: DARK } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E2E8F0" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = BORDER;
    });

    // Movements for this opening
    const turnoMovs = (movsByOpening[o.id] || []).sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || "")
    );

    let turnoSales = 0, turnoIncome = 0, turnoExpense = 0, turnoRefunds = 0, saleCount = 0;

    turnoMovs.forEach((m, i) => {
      const amt = Number(m.amount);
      const isNegative = m.type === "expense" || m.type === "refund";

      if (m.type === "sale") { turnoSales += amt; saleCount++; }
      else if (m.type === "income") turnoIncome += amt;
      else if (m.type === "expense") turnoExpense += amt;
      else if (m.type === "refund") turnoRefunds += amt;

      const row = ws.addRow([
        m.created_at ? formatDateTimeFull(m.created_at) : "—",
        TYPE_LABELS[m.type] || m.type,
        m.description || m.reason || "—",
        isNegative ? -amt : amt,
        m.receipt_number || "—",
        m.payment_method ? (PAYMENT_LABELS[m.payment_method] || m.payment_method) : "—",
      ]);
      row.height = 20;
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(4).font = { name: "Calibri", size: 10, color: { argb: isNegative ? DESTRUCTIVE : DARK } };
      row.eachCell((cell, colNumber) => {
        if (colNumber !== 4) cell.font = cell.font || { name: "Calibri", size: 10 };
        cell.alignment = { vertical: "middle" };
        cell.border = BORDER;
        if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT } };
      });
    });

    if (turnoMovs.length === 0) {
      addMergedRow("  Sin movimientos en este turno", { size: 9, italic: true, color: { argb: MUTED } }, 18);
    }

    // Subtotals
    ws.addRow([]);
    if (turnoSales > 0) addKpiRow(`  Subtotal ventas (${saleCount} comprobantes)`, turnoSales);
    if (turnoIncome > 0) addKpiRow("  Subtotal ingresos", turnoIncome, SUCCESS);
    if (turnoExpense > 0) addKpiRow("  Subtotal egresos", turnoExpense, DESTRUCTIVE);
    if (turnoRefunds > 0) addKpiRow("  Subtotal devoluciones", turnoRefunds);

    // Closing data
    if (o.closed_at) {
      const closingRow = addMergedRow(
        `CIERRE  ·  Esperado: S/ ${(o.expected_amount ?? 0).toFixed(2)}  |  Contado: S/ ${(o.closing_amount ?? 0).toFixed(2)}  |  Diferencia: S/ ${(o.difference ?? 0).toFixed(2)}`,
        { size: 9, bold: true, color: { argb: (o.difference ?? 0) === 0 ? SUCCESS : DESTRUCTIVE } },
        20,
      );
      closingRow.getCell(1).border = { bottom: { style: "medium", color: { argb: "CBD5E1" } } };

      if (o.notes) {
        addMergedRow(`  Observaciones: ${o.notes}`, { size: 9, italic: true, color: { argb: MUTED } }, 18);
      }
    }

    ws.addRow([]); // Spacer between shifts
  });

  // ═══════════════════════════════════════════
  // TOTALES GENERALES
  // ═══════════════════════════════════════════
  addMergedRow("TOTALES GENERALES", { size: 12, bold: true, color: { argb: "FFFFFF" } }, 26, DARK);
  addKpiRow("Total ventas efectivo", report.totals.total_sales);
  addKpiRow("Total ingresos", report.totals.total_cash_in, SUCCESS);
  addKpiRow("Total egresos", report.totals.total_cash_out, DESTRUCTIVE);
  addKpiRow("Total devoluciones", report.totals.total_refunds);
  addKpiRow("Total movimientos", report.movements.length);
  addKpiRow("Total turnos", report.openings.length);

  ws.addRow([]);
  addMergedRow(`Generado: ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}`, { size: 8, italic: true, color: { argb: MUTED } }, 16);

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte-caja-${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function DailyReportDialog({
  open,
  onOpenChange,
  registers,
}: DailyReportDialogProps) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [registerId, setRegisterId] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  const { data: report, isLoading } = useDailyReport(
    open ? date : "",
    registerId === "all" ? undefined : registerId
  );

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportDailyReportExcel(report, date);
      toast.success("Reporte exportado correctamente");
    } catch {
      toast.error("Error al exportar reporte");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reporte del Dia</DialogTitle>
          <DialogDescription>
            Resumen de operaciones de caja para la fecha seleccionada.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="report-date">Fecha</Label>
            <Input
              id="report-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Caja</Label>
            <Select value={registerId} onValueChange={setRegisterId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todas las cajas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cajas</SelectItem>
                {registers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!report || exporting}
          >
            {exporting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 size-4" />
            )}
            Exportar Excel
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : report ? (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: "Ventas", value: report.totals.total_sales, color: "text-foreground" },
                { label: "Ingresos", value: report.totals.total_cash_in, color: "text-success" },
                { label: "Egresos", value: report.totals.total_cash_out, color: "text-destructive" },
                { label: "Devoluciones", value: report.totals.total_refunds, color: "text-warning" },
              ].map((kpi, i) => (
                <Card
                  key={kpi.label}
                  className="border-border"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono tabular-nums ${kpi.color}`}>
                      {formatCurrency(kpi.value)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Sales by payment method */}
            {Object.keys(report.sales_by_payment).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Ventas por metodo de pago
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(report.sales_by_payment).map(([method, total]) => (
                    <div
                      key={method}
                      className="rounded-md border border-border bg-secondary/20 px-3 py-1.5"
                    >
                      <span className="text-xs text-muted-foreground">
                        {PAYMENT_LABELS[method] || method}
                      </span>
                      <p className="font-mono text-sm font-medium text-foreground tabular-nums">
                        {formatCurrency(total)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Openings */}
            {report.openings.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Aperturas ({report.openings.length})
                </h4>
                <div className="space-y-2">
                  {report.openings.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-md border border-border p-3 text-sm transition-colors hover:bg-secondary/10"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          {o.cash_register_name}
                        </span>
                        <StatusBadge
                          status={o.closed_at ? "closed" : "active"}
                          customLabel={o.closed_at ? "Cerrada" : "Abierta"}
                        />
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Abrio: {o.opened_by_name || "---"}</span>
                        <span>Cerro: {o.closed_by_name || "---"}</span>
                        <span>Apertura: {formatDateTime(o.opened_at)}</span>
                        <span>
                          Cierre: {o.closed_at ? formatDateTime(o.closed_at) : "---"}
                        </span>
                        <span>
                          Monto apertura:{" "}
                          <span className="font-mono tabular-nums">
                            {formatCurrency(o.opening_amount)}
                          </span>
                        </span>
                        {o.expected_amount != null && (
                          <span>
                            Esperado:{" "}
                            <span className="font-mono tabular-nums">
                              {formatCurrency(o.expected_amount)}
                            </span>
                          </span>
                        )}
                        {o.difference != null && o.difference !== 0 && (
                          <span
                            className={
                              o.difference > 0 ? "text-success" : "text-destructive"
                            }
                          >
                            Diferencia:{" "}
                            <span className="font-mono tabular-nums">
                              {o.difference > 0 ? "+" : ""}
                              {formatCurrency(o.difference)}
                            </span>
                          </span>
                        )}
                      </div>
                      {o.notes && (
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          {o.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Movements summary */}
            <div>
              <h4 className="mb-1 text-sm font-semibold text-foreground">
                Movimientos ({report.movements.length})
              </h4>
              {report.movements.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin movimientos para esta fecha.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {report.movements.length} movimiento
                  {report.movements.length !== 1 ? "s" : ""} registrado
                  {report.movements.length !== 1 ? "s" : ""}.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Selecciona una fecha para ver el reporte.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
