type TextItemLike = { str: string; transform: number[]; width?: number };

export async function extractPdfText(data: Uint8Array) {
  if (typeof window === "undefined") {
    throw new Error("PDF-lesing må kjøres i nettleseren.");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const loadingTask = pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => "str" in item && "transform" in item)
      .map((item) => item as unknown as TextItemLike);
    const rows = new Map<number, TextItemLike[]>();

    items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      const rowKey = Array.from(rows.keys()).find((key) => Math.abs(key - y) <= 2) ?? y;
      const row = rows.get(rowKey) || [];
      row.push(item);
      rows.set(rowKey, row);
    });

    const pageText = Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");

    pages.push(pageText);
  }

  return pages.join("\n");
}
