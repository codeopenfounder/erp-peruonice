"use client";

import { useCallback, type RefObject } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { exportFlatData } from "@/lib/utils/export-flat";
import { exportChartToPdf, exportTableToPdf } from "@/lib/utils/export-pdf";

interface ExportColumn {
  header: string;
  key: string;
  width?: number;
  format?: (value: unknown) => string | number;
}

interface ChartExportButtonProps {
  chartTitle: string;
  dateRange: { from: string; to: string };
  columns: ExportColumn[];
  getData: () => Record<string, unknown>[];
  chartRef?: RefObject<HTMLDivElement | null>;
}

export function ChartExportButton({
  chartTitle,
  dateRange,
  columns,
  getData,
  chartRef,
}: ChartExportButtonProps) {
  const filename = `${chartTitle.toLowerCase().replace(/\s+/g, "-")}-${dateRange.from}-a-${dateRange.to}`;

  const handleExportExcel = useCallback(async () => {
    const data = getData();
    if (!data.length) {
      toast.error("Sin datos para exportar");
      return;
    }
    try {
      await exportFlatData({
        filename,
        sheetName: chartTitle,
        reportTitle: chartTitle,
        dateRange,
        columns,
        data,
        format: "xlsx",
      });
      toast.success("Excel exportado");
    } catch {
      toast.error("Error al exportar Excel");
    }
  }, [filename, chartTitle, dateRange, columns, getData]);

  const handleExportPdf = useCallback(async () => {
    const data = getData();
    if (!data.length) {
      toast.error("Sin datos para exportar");
      return;
    }
    try {
      if (chartRef?.current) {
        await exportChartToPdf({
          filename,
          reportTitle: chartTitle,
          dateRange,
          columns,
          data,
          chartElement: chartRef.current,
        });
      } else {
        await exportTableToPdf({
          filename,
          reportTitle: chartTitle,
          dateRange,
          columns,
          data,
        });
      }
      toast.success("PDF exportado");
    } catch {
      toast.error("Error al exportar PDF");
    }
  }, [filename, chartTitle, dateRange, columns, getData, chartRef]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="sr-only">Exportar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={handleExportExcel}>
          <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPdf}>
          <FileText className="mr-2 h-3.5 w-3.5" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
