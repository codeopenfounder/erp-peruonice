interface FlatExportColumn {
  header: string
  key: string
  width?: number
  format?: (value: unknown) => string | number
}

interface PdfExportOptions {
  filename: string
  reportTitle: string
  dateRange?: { from: string; to: string }
  columns: FlatExportColumn[]
  data: Record<string, unknown>[]
}

interface ChartPdfExportOptions extends PdfExportOptions {
  chartElement: HTMLElement
}

const BRAND_RED: [number, number, number] = [220, 38, 38]
const HEADER_BG: [number, number, number] = [31, 41, 55]

function buildTableData(columns: FlatExportColumn[], data: Record<string, unknown>[]) {
  const headers = columns.map((c) => c.header)
  const body = data.map((row) =>
    columns.map((col) => {
      const val = row[col.key]
      if (col.format) return String(col.format(val))
      return val == null ? "" : String(val)
    })
  )
  return { headers, body }
}

export async function exportTableToPdf(opts: PdfExportOptions): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Brand bar
  doc.setFillColor(...BRAND_RED)
  doc.rect(0, 0, pageWidth, 4, "F")

  // Title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(31, 41, 55)
  doc.text(opts.reportTitle, 14, 16)

  // Subtitle
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  const parts: string[] = []
  if (opts.dateRange) parts.push(`${opts.dateRange.from} al ${opts.dateRange.to}`)
  parts.push(`Generado: ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}`)
  doc.text(parts.join("  |  "), 14, 22)

  const { headers, body } = buildTableData(opts.columns, opts.data)

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body,
    theme: "grid",
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: 2,
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 1.5,
      textColor: [31, 41, 55],
    },
    alternateRowStyles: {
      fillColor: [254, 242, 242],
    },
    styles: {
      lineColor: [229, 231, 235],
      lineWidth: 0.1,
      overflow: "linebreak",
    },
    margin: { top: 10, left: 14, right: 14 },
    didDrawPage: (data) => {
      const ph = doc.internal.pageSize.getHeight()
      doc.setFontSize(7)
      doc.setTextColor(156, 163, 175)
      doc.text(`Peru On Ice - Pagina ${data.pageNumber}`, 14, ph - 6)
    },
  })

  doc.save(`${opts.filename}.pdf`)
}

export async function exportChartToPdf(opts: ChartPdfExportOptions): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Brand bar
  doc.setFillColor(...BRAND_RED)
  doc.rect(0, 0, pageWidth, 4, "F")

  // Title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(31, 41, 55)
  doc.text(opts.reportTitle, 14, 16)

  // Subtitle
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  const parts: string[] = []
  if (opts.dateRange) parts.push(`${opts.dateRange.from} al ${opts.dateRange.to}`)
  parts.push(`Generado: ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}`)
  doc.text(parts.join("  |  "), 14, 22)

  let y = 28

  // Chart image
  try {
    const { default: html2canvas } = await import("html2canvas")
    const canvas = await html2canvas(opts.chartElement, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
    })
    const imgData = canvas.toDataURL("image/png")
    const imgWidth = pageWidth - 28
    const imgHeight = imgWidth * 0.45
    doc.addImage(imgData, "PNG", 14, y, imgWidth, imgHeight)
    y += imgHeight + 6
  } catch {
    y += 4
  }

  // Data table
  if (opts.data.length > 0) {
    const { headers, body } = buildTableData(opts.columns, opts.data)

    autoTable(doc, {
      startY: y,
      head: [headers],
      body,
      theme: "grid",
      headStyles: {
        fillColor: HEADER_BG,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7,
        cellPadding: 2,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 1.5,
        textColor: [31, 41, 55],
      },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      styles: { lineColor: [229, 231, 235], lineWidth: 0.1, overflow: "linebreak" },
      margin: { top: 10, left: 14, right: 14 },
      didDrawPage: (data) => {
        const ph = doc.internal.pageSize.getHeight()
        doc.setFontSize(7)
        doc.setTextColor(156, 163, 175)
        doc.text(`Peru On Ice - Pagina ${data.pageNumber}`, 14, ph - 6)
      },
    })
  }

  doc.save(`${opts.filename}.pdf`)
}
