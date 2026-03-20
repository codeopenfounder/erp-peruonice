import ExcelJS from "exceljs";

interface ExportColumn {
  header: string;
  key: string;
  width?: number;
  format?: (value: unknown) => string | number;
}

export async function exportToExcel(opts: {
  filename: string;
  sheetName: string;
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  title?: string;
}): Promise<void> {
  const { filename, sheetName, columns, data, title } = opts;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  const BRAND_COLOR = "00B8D4";
  const BORDER_COLOR = "E2E8F0";
  const ALT_ROW_COLOR = "F0FAFE";

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: BORDER_COLOR } },
    bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    left: { style: "thin", color: { argb: BORDER_COLOR } },
    right: { style: "thin", color: { argb: BORDER_COLOR } },
  };

  let dataStartRow = 1;

  // Title row
  if (title) {
    const titleRow = sheet.addRow([title]);
    sheet.mergeCells(1, 1, 1, columns.length);
    titleRow.height = 32;
    const titleCell = titleRow.getCell(1);
    titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: BRAND_COLOR } };
    titleCell.alignment = { vertical: "middle" };

    // Date subtitle
    const dateRow = sheet.addRow([`Generado: ${new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}`]);
    sheet.mergeCells(2, 1, 2, columns.length);
    dateRow.getCell(1).font = { name: "Calibri", size: 9, italic: true, color: { argb: "94A3B8" } };
    dateRow.getCell(1).alignment = { vertical: "middle" };

    // Spacer
    sheet.addRow([]);
    dataStartRow = 4;
  }

  // Header row
  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_COLOR } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });

  // Set column widths
  columns.forEach((col, i) => {
    const sheetCol = sheet.getColumn(i + 1);
    sheetCol.width = col.width ?? 15;
  });

  // Data rows
  data.forEach((row, rowIndex) => {
    const values = columns.map((col) => {
      const raw = row[col.key];
      return col.format ? col.format(raw) : (raw ?? "");
    });
    const dataRow = sheet.addRow(values);
    dataRow.height = 22;

    dataRow.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 10 };
      cell.alignment = { vertical: "middle" };
      cell.border = thinBorder;

      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_COLOR } };
      }
    });
  });

  // Total row count
  const totalRow = sheet.addRow([`Total: ${data.length} registros`]);
  sheet.mergeCells(dataStartRow + data.length + 1, 1, dataStartRow + data.length + 1, columns.length);
  totalRow.getCell(1).font = { name: "Calibri", size: 9, italic: true, color: { argb: "64748B" } };
  totalRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
