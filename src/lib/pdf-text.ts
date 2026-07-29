type TextItemLike = { str: string; transform: number[]; width?: number };

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{ items: unknown[] }>;
  }>;
};

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: Record<string, unknown>) => { promise: Promise<PdfJsDocument> };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

const PDFJS_VERSION = "3.11.174";
const PDFJS_SCRIPT = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
let pdfJsPromise: Promise<PdfJsLib> | null = null;

function loadPdfJs(): Promise<PdfJsLib> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF-lesing må kjøres i nettleseren."));
  }

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(window.pdfjsLib);
  }

  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = new Promise<PdfJsLib>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-pdfjs-version="${PDFJS_VERSION}"]`);
    const script = existing || document.createElement("script");

    const finish = () => {
      if (!window.pdfjsLib) {
        reject(new Error("PDF-leseren kunne ikke startes."));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(window.pdfjsLib);
    };

    if (existing) {
      if (window.pdfjsLib) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("PDF-leseren kunne ikke lastes.")), { once: true });
      }
      return;
    }

    script.src = PDFJS_SCRIPT;
    script.async = true;
    script.dataset.pdfjsVersion = PDFJS_VERSION;
    script.onload = finish;
    script.onerror = () => reject(new Error("PDF-leseren kunne ikke lastes. Kontroller internettforbindelsen."));
    document.head.appendChild(script);
  });

  return pdfJsPromise;
}

export async function extractPdfText(data: Uint8Array) {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is TextItemLike => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Partial<TextItemLike>;
        return typeof candidate.str === "string" && Array.isArray(candidate.transform);
      });
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
      .map(([, row]) =>
        row
          .sort((a, b) => a.transform[4] - b.transform[4])
          .map((item) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");

    pages.push(pageText);
  }

  return pages.join("\n");
}
