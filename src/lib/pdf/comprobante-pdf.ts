import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import {
  buildSunatQrPayload,
  currencySymbol,
  docLabel,
  formatDate,
  formatPayment,
  padCorrelative,
  reasonLabel,
  type DocumentType,
} from "./sunat-format";

export interface ComprobantePdfInput {
  emisor: {
    ruc: string;
    razonSocial: string;
    direccion: string;
    logoUrl?: string | null;
  };
  comprobante: {
    documentType: DocumentType;
    seriesCode: string;
    correlative: number;
    issueDate: string;
    currency: string;
    paymentMethod: string;
    referenceDoc?: string | null;
    referenceReason?: string | null;
    hashCode?: string | null;
    cashierName?: string | null;
    branchName?: string | null;
  };
  customer: {
    name: string;
    docType: string;
    docNumber: string;
    address?: string | null;
  } | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    total: number;
    isCortesia: boolean;
  }>;
  totals: {
    opGravada: number;
    opExonerada: number;
    opInafecta: number;
    igvTotal: number;
    discountTotal: number;
    total: number;
  };
}

const PAGE_W = 210;
const MARGIN = 15;
const RIGHT_BOX_X = 130;
const RIGHT_BOX_W = 65;
const PRIMARY = "#DC2626";
const TEXT = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function setColor(doc: jsPDF, hex: string, kind: "text" | "draw" | "fill") {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (kind === "text") doc.setTextColor(r, g, b);
  else if (kind === "draw") doc.setDrawColor(r, g, b);
  else doc.setFillColor(r, g, b);
}

export async function generateComprobantePdf(
  input: ComprobantePdfInput,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const { emisor, comprobante, customer, items, totals } = input;
  const sym = currencySymbol(comprobante.currency);
  const corr = padCorrelative(comprobante.correlative);

  let y = MARGIN;

  // Logo (opcional)
  let logoData: string | null = null;
  if (emisor.logoUrl) {
    logoData = await urlToDataUrl(emisor.logoUrl);
  }
  if (logoData) {
    try {
      const fmt = logoData.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(logoData, fmt, MARGIN, y, 28, 28);
    } catch {
      // ignore broken logo
    }
  }

  // Datos del emisor
  setColor(doc, TEXT, "text");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(emisor.razonSocial, MARGIN + (logoData ? 32 : 0), y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(doc, MUTED, "text");
  doc.text(`RUC: ${emisor.ruc}`, MARGIN + (logoData ? 32 : 0), y + 12);
  if (emisor.direccion) {
    const lines = doc.splitTextToSize(
      emisor.direccion,
      RIGHT_BOX_X - MARGIN - (logoData ? 32 : 0) - 5,
    );
    doc.text(lines, MARGIN + (logoData ? 32 : 0), y + 17);
  }

  // Cuadro derecha: tipo doc + número
  setColor(doc, PRIMARY, "draw");
  doc.setLineWidth(0.6);
  doc.rect(RIGHT_BOX_X, y, RIGHT_BOX_W, 30);

  setColor(doc, PRIMARY, "text");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`RUC ${emisor.ruc}`, RIGHT_BOX_X + RIGHT_BOX_W / 2, y + 6, { align: "center" });

  doc.setFontSize(11);
  setColor(doc, TEXT, "text");
  doc.text(docLabel(comprobante.documentType), RIGHT_BOX_X + RIGHT_BOX_W / 2, y + 14, {
    align: "center",
    maxWidth: RIGHT_BOX_W - 4,
  });

  doc.setFontSize(15);
  setColor(doc, PRIMARY, "text");
  doc.text(
    `${comprobante.seriesCode}-${corr}`,
    RIGHT_BOX_X + RIGHT_BOX_W / 2,
    y + 24,
    { align: "center" },
  );

  y += 38;

  // Bloque NC/ND si aplica
  if (
    (comprobante.documentType === "nota_credito" ||
      comprobante.documentType === "nota_debito") &&
    (comprobante.referenceDoc || comprobante.referenceReason)
  ) {
    setColor(doc, "#fef3c7", "fill");
    setColor(doc, "#f59e0b", "draw");
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 12, 1, 1, "FD");

    setColor(doc, TEXT, "text");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    if (comprobante.referenceDoc) {
      doc.text(`Modifica: ${comprobante.referenceDoc}`, MARGIN + 3, y + 5);
    }
    doc.setFont("helvetica", "normal");
    if (comprobante.referenceReason) {
      doc.text(
        `Motivo ${comprobante.referenceReason}: ${reasonLabel(comprobante.referenceReason, comprobante.documentType)}`,
        MARGIN + 3,
        y + 10,
      );
    }
    y += 16;
  }

  // Bloque cliente + meta
  setColor(doc, "#f8fafc", "fill");
  setColor(doc, BORDER, "draw");
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 22, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setColor(doc, MUTED, "text");
  doc.text("CLIENTE", MARGIN + 3, y + 5);
  doc.text("FECHA EMISIÓN", PAGE_W / 2 + 5, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(doc, TEXT, "text");
  if (customer && customer.name) {
    const cName = doc.splitTextToSize(customer.name, PAGE_W / 2 - MARGIN - 5);
    doc.text(cName, MARGIN + 3, y + 10);
    if (customer.docNumber) {
      const docTypeLabel =
        customer.docType === "ruc"
          ? "RUC"
          : customer.docType === "dni"
          ? "DNI"
          : customer.docType === "ce"
          ? "CE"
          : "DOC";
      doc.text(`${docTypeLabel}: ${customer.docNumber}`, MARGIN + 3, y + 15);
    }
    if (
      customer.address &&
      (comprobante.documentType === "factura" ||
        comprobante.documentType === "nota_credito" ||
        comprobante.documentType === "nota_debito")
    ) {
      const addr = doc.splitTextToSize(
        `Dir: ${customer.address}`,
        PAGE_W / 2 - MARGIN - 5,
      );
      doc.text(addr, MARGIN + 3, y + 19);
    }
  } else {
    doc.text("CLIENTE VARIOS", MARGIN + 3, y + 10);
  }

  doc.text(formatDate(comprobante.issueDate), PAGE_W / 2 + 5, y + 10);
  doc.text(`Pago: ${formatPayment(comprobante.paymentMethod)}`, PAGE_W / 2 + 5, y + 15);
  if (comprobante.cashierName) {
    doc.text(`Cajero: ${comprobante.cashierName}`, PAGE_W / 2 + 5, y + 20);
  }

  y += 28;

  // Tabla de items
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Cant.", "Descripción", "P.U.", "Desc.", "Total"]],
    body: items.map((it) => {
      const qtyStr =
        it.quantity === Math.floor(it.quantity)
          ? String(it.quantity)
          : it.quantity.toFixed(2);
      let descr = it.description;
      if (it.isCortesia) descr += " (Cortesía)";
      return [
        qtyStr,
        descr,
        it.unitPrice.toFixed(2),
        it.discountAmount > 0 ? `-${it.discountAmount.toFixed(2)}` : "—",
        it.total.toFixed(2),
      ];
    }),
    theme: "grid",
    headStyles: {
      fillColor: [220, 38, 38],
      textColor: 255,
      fontSize: 9,
      halign: "center",
      cellPadding: 2,
    },
    bodyStyles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { halign: "center", cellWidth: 18 },
      1: { halign: "left" },
      2: { halign: "right", cellWidth: 25 },
      3: { halign: "right", cellWidth: 22 },
      4: { halign: "right", cellWidth: 28 },
    },
    didDrawPage: (data) => {
      y = data.cursor?.y ?? y;
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Totales (derecha)
  const totX = PAGE_W - MARGIN - 70;
  const totW = 70;
  const totRows: Array<[string, string]> = [];
  if (totals.opGravada > 0) totRows.push(["Op. Gravadas:", `${sym} ${totals.opGravada.toFixed(2)}`]);
  if (totals.opExonerada > 0) totRows.push(["Op. Exoneradas:", `${sym} ${totals.opExonerada.toFixed(2)}`]);
  if (totals.opInafecta > 0) totRows.push(["Op. Inafectas:", `${sym} ${totals.opInafecta.toFixed(2)}`]);
  if (totals.igvTotal > 0) totRows.push(["IGV (18%):", `${sym} ${totals.igvTotal.toFixed(2)}`]);
  if (totals.discountTotal > 0) totRows.push(["Descuento:", `-${sym} ${totals.discountTotal.toFixed(2)}`]);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(doc, MUTED, "text");
  for (const [label, val] of totRows) {
    doc.text(label, totX, y);
    setColor(doc, TEXT, "text");
    doc.text(val, totX + totW, y, { align: "right" });
    setColor(doc, MUTED, "text");
    y += 5;
  }

  // Total destacado
  setColor(doc, PRIMARY, "fill");
  doc.rect(totX - 2, y - 2, totW + 4, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL:", totX, y + 4);
  doc.text(`${sym} ${totals.total.toFixed(2)}`, totX + totW, y + 4, { align: "right" });

  y += 14;

  // QR + hash + leyenda
  const qrPayload = buildSunatQrPayload({
    ruc: emisor.ruc,
    documentType: comprobante.documentType,
    seriesCode: comprobante.seriesCode,
    correlative: comprobante.correlative,
    igvTotal: totals.igvTotal,
    total: totals.total,
    issueDateIso: comprobante.issueDate,
    customerDocType: customer?.docType ?? null,
    customerDocNumber: customer?.docNumber ?? null,
    hashCode: comprobante.hashCode ?? null,
  });

  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 160,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    doc.addImage(qrDataUrl, "PNG", MARGIN, y, 35, 35);
  } catch {
    // omit QR if generation fails
  }

  setColor(doc, MUTED, "text");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (comprobante.hashCode) {
    doc.text(`Hash: ${comprobante.hashCode}`, MARGIN + 40, y + 8);
  }
  doc.text(
    `Representación impresa de la ${docLabel(comprobante.documentType)}`,
    MARGIN + 40,
    y + 14,
    { maxWidth: PAGE_W - MARGIN * 2 - 40 },
  );
  doc.text("Consulte su comprobante en sunat.gob.pe", MARGIN + 40, y + 19);
  if (comprobante.branchName) {
    doc.text(`Sede: ${comprobante.branchName}`, MARGIN + 40, y + 24);
  }

  return doc;
}

export async function downloadComprobantePdf(
  input: ComprobantePdfInput,
  filename?: string,
): Promise<void> {
  const doc = await generateComprobantePdf(input);
  const corr = padCorrelative(input.comprobante.correlative);
  const name = filename || `${input.comprobante.seriesCode}-${corr}.pdf`;
  doc.save(name);
}
