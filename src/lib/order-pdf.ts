import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type OrderPdfLine = {
  name: string;
  detail?: string;
  packages: number;
};

type OrderPdfInput = {
  lagerOrderNumber?: number;
  week: number;
  year: number;
  orderedBy: string;
  orderedAt: number;
  lines: OrderPdfLine[];
};

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9æøåÆØÅ._-]+/g, "-").replace(/-+/g, "-");
}

function download(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function generateOrderPdf(input: OrderPdfInput) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 42;
  const rowHeight = 31;
  let page = document.addPage(pageSize);
  let y = 790;

  const addHeader = () => {
    page.drawRectangle({ x: 0, y: 768, width: pageSize[0], height: 74, color: rgb(0.02, 0.18, 0.36) });
    page.drawText(`Lagerordre ${input.lagerOrderNumber || "-"}`, { x: margin, y: 803, size: 20, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Vareoversikt", { x: margin, y: 782, size: 10, font: regular, color: rgb(0.86, 0.91, 0.97) });
    y = 744;
  };

  const addTableHeader = () => {
    page.drawRectangle({ x: margin, y: y - 19, width: pageSize[0] - margin * 2, height: 24, color: rgb(0.91, 0.94, 0.97) });
    page.drawText("Vare", { x: margin + 8, y: y - 12, size: 9, font: bold, color: rgb(0.08, 0.17, 0.31) });
    page.drawText("Bestilt", { x: 500, y: y - 12, size: 9, font: bold, color: rgb(0.08, 0.17, 0.31) });
    y -= 24;
  };

  addHeader();
  page.drawText(`Uke ${input.week} / ${input.year}`, { x: margin, y, size: 11, font: bold, color: rgb(0.08, 0.17, 0.31) });
  page.drawText(`Bestilt av: ${input.orderedBy || "Ukjent"}`, { x: 205, y, size: 10, font: regular, color: rgb(0.25, 0.32, 0.42) });
  page.drawText(`Dato: ${new Date(input.orderedAt).toLocaleDateString("nb-NO")}`, { x: 430, y, size: 10, font: regular, color: rgb(0.25, 0.32, 0.42) });
  y -= 28;
  addTableHeader();

  input.lines.forEach((line, index) => {
    if (y < 72) {
      page = document.addPage(pageSize);
      addHeader();
      addTableHeader();
    }

    if (index % 2 === 1) page.drawRectangle({ x: margin, y: y - rowHeight + 5, width: pageSize[0] - margin * 2, height: rowHeight, color: rgb(0.97, 0.98, 0.99) });
    const name = line.name.length > 72 ? `${line.name.slice(0, 69)}...` : line.name;
    page.drawText(name, { x: margin + 8, y: y - 10, size: 9.5, font: bold, color: rgb(0.06, 0.15, 0.28) });
    if (line.detail) page.drawText(line.detail.slice(0, 86), { x: margin + 8, y: y - 23, size: 7.5, font: regular, color: rgb(0.38, 0.44, 0.52) });
    page.drawText(`${line.packages} pk`, { x: 500, y: y - 14, size: 9.5, font: bold, color: rgb(0.06, 0.15, 0.28) });
    page.drawLine({ start: { x: margin, y: y - rowHeight + 5 }, end: { x: pageSize[0] - margin, y: y - rowHeight + 5 }, thickness: 0.5, color: rgb(0.86, 0.89, 0.93) });
    y -= rowHeight;
  });

  y -= 12;
  const total = input.lines.reduce((sum, line) => sum + line.packages, 0);
  page.drawText(`Totalt bestilt: ${total} pakker`, { x: 390, y, size: 11, font: bold, color: rgb(0.02, 0.18, 0.36) });
  page.drawText("Generert fra Trelastordre", { x: margin, y: 32, size: 7.5, font: regular, color: rgb(0.45, 0.5, 0.57) });

  const bytes = await document.save();
  download(bytes, safeFileName(`Lagerordre-${input.lagerOrderNumber || "ukjent"}-uke-${input.week}.pdf`));
}
