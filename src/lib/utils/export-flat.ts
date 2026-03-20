import ExcelJS from "exceljs"

interface FlatExportColumn {
  header: string
  key: string
  width?: number
  format?: (value: unknown) => string | number
}

interface FlatExportOptions {
  filename: string
  sheetName: string
  reportTitle: string
  dateRange?: { from: string; to: string }
  columns: FlatExportColumn[]
  data: Record<string, unknown>[]
  format: "xlsx" | "csv"
}

const BRAND_COLOR = "DC2626"
const HEADER_BG = "1F2937"
const BORDER_COLOR = "E5E7EB"
const ALT_ROW_COLOR = "FEF2F2"

/**
 * Export flat data to XLSX or CSV.
 * Follows the "Golden Rule": no merged cells, no blank rows, no totals.
 * Each row = one record, each column = one repeatable attribute.
 */
export async function exportFlatData(opts: FlatExportOptions): Promise<void> {
  if (opts.format === "csv") {
    return exportCSV(opts)
  }
  return exportXLSX(opts)
}

// ---------------------------------------------------------------------------
// XLSX Export (ExcelJS)
// ---------------------------------------------------------------------------

async function exportXLSX(opts: FlatExportOptions): Promise<void> {
  const { filename, sheetName, reportTitle, dateRange, columns, data } = opts
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
  }

  // Row 1: Report title (NO merge - just in column A)
  const titleText = dateRange
    ? `${reportTitle} | ${dateRange.from} - ${dateRange.to}`
    : reportTitle
  const titleRow = sheet.addRow([titleText])
  titleRow.height = 28
  titleRow.getCell(1).font = {
    name: "Calibri",
    size: 12,
    bold: true,
    color: { argb: BRAND_COLOR },
  }
  titleRow.getCell(1).alignment = { vertical: "middle" }

  // Row 2: Generation date (NO merge - just in column A)
  const dateStr = new Date().toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  })
  const dateRow = sheet.addRow([`Generado: ${dateStr}`])
  dateRow.getCell(1).font = {
    name: "Calibri",
    size: 9,
    italic: true,
    color: { argb: "6B7280" },
  }

  // Row 3: Column headers (bold, dark background)
  const headerRow = sheet.addRow(columns.map((c) => c.header))
  headerRow.height = 26
  headerRow.eachCell((cell) => {
    cell.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: "FFFFFF" },
    }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_BG },
    }
    cell.alignment = { vertical: "middle", horizontal: "center" }
    cell.border = thinBorder
  })

  // Set column widths
  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width ?? 16
  })

  // Data rows (row 4+)
  data.forEach((row, rowIndex) => {
    const values = columns.map((col) => {
      const raw = row[col.key]
      return col.format ? col.format(raw) : (raw ?? "")
    })
    const dataRow = sheet.addRow(values)
    dataRow.height = 20

    dataRow.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 10 }
      cell.alignment = { vertical: "middle" }
      cell.border = thinBorder

      // Alternating row color
      if (rowIndex % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ALT_ROW_COLOR },
        }
      }

      // Right-align numeric columns
      const raw = row[columns[colNumber - 1]?.key]
      if (typeof raw === "number") {
        cell.alignment = { vertical: "middle", horizontal: "right" }
        cell.numFmt = "#,##0.00"
      }
    })
  })

  // Auto-filter on header row
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: columns.length },
  }

  // Freeze header rows (title + date + headers)
  sheet.views = [{ state: "frozen", ySplit: 3, xSplit: 0 }]

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  triggerDownload(blob, `${filename}.xlsx`)
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

async function exportCSV(opts: FlatExportOptions): Promise<void> {
  const { filename, columns, data } = opts

  const escapeCSV = (val: unknown): string => {
    const str = val == null ? "" : String(val)
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines: string[] = []

  // Header row
  lines.push(columns.map((c) => escapeCSV(c.header)).join(","))

  // Data rows
  for (const row of data) {
    const values = columns.map((col) => {
      const raw = row[col.key]
      const val = col.format ? col.format(raw) : raw
      return escapeCSV(val)
    })
    lines.push(values.join(","))
  }

  // UTF-8 BOM so Excel reads accented characters correctly
  const BOM = "\uFEFF"
  const csvContent = BOM + lines.join("\r\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  triggerDownload(blob, `${filename}.csv`)
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
