"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import {
  normalizedLineKey,
  parseMoelvenConfirmation,
  type MoelvenConfirmationLine,
  type OriginalOrderLine,
  type ParsedMoelvenConfirmation,
} from "@/lib/moelvenConfirmation";

type Confirmation = ParsedMoelvenConfirmation & {
  id: string;
  fileName: string;
  pdfUrl: string;
  uploadedAt: number;
  uploadedBy: string;
  version: number;
};

type Props = {
  sentOrderId: string;
  originalLines?: OriginalOrderLine[];
  uploadedBy: string;
};

function formatNumber(value?: number, decimals = 0) {
  if (value === undefined) return "–";
  return value.toLocaleString("nb-NO", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform?: number[] }>;
    let lastY: number | undefined;
    let pageText = "";
    items.forEach((item) => {
      const y = item.transform?.[5];
      if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 2) pageText += "\n";
      else if (pageText && !pageText.endsWith("\n")) pageText += " ";
      pageText += item.str;
      lastY = y;
    });
    pages.push(pageText);
  }

  return pages.join("\n");
}

export function OrderConfirmationPanel({ sentOrderId, originalLines = [], uploadedBy }: Props) {
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, "sentOrders", sentOrderId, "confirmations"), orderBy("uploadedAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setConfirmations(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Confirmation)));
    });
  }, [sentOrderId]);

  const latest = confirmations[0];

  const comparison = useMemo(() => {
    if (!latest) return [];
    const originalMap = new Map<string, OriginalOrderLine[]>();
    originalLines.forEach((line) => {
      const key = normalizedLineKey(line.dimension, line.length);
      originalMap.set(key, [...(originalMap.get(key) || []), line]);
    });
    const confirmedMap = new Map<string, MoelvenConfirmationLine[]>();
    latest.lines.forEach((line) => {
      const key = normalizedLineKey(line.dimension, line.length);
      confirmedMap.set(key, [...(confirmedMap.get(key) || []), line]);
    });

    const keys = new Set([...originalMap.keys(), ...confirmedMap.keys()]);
    return [...keys].map((key) => {
      const original = originalMap.get(key) || [];
      const confirmed = confirmedMap.get(key) || [];
      const orderedPackages = original.reduce((sum, line) => sum + line.packages, 0);
      const confirmedPackages = confirmed.reduce((sum, line) => sum + line.packages, 0);
      const sample = confirmed[0] || original[0];
      let status: "same" | "changed" | "added" | "missing" = "same";
      if (!original.length) status = "added";
      else if (!confirmed.length) status = "missing";
      else if (orderedPackages !== confirmedPackages) status = "changed";
      return { key, sample, orderedPackages, confirmedPackages, status };
    });
  }, [latest, originalLines]);

  async function handleFile(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Velg en PDF-fil.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const rawText = await extractPdfText(file);
      const parsed = parseMoelvenConfirmation(rawText);
      if (!parsed.lines.length) throw new Error("Fant ingen varelinjer. PDF-en kan være skannet eller ha et ukjent format.");

      const safeName = file.name.replace(/[^a-zA-Z0-9æøåÆØÅ._-]/g, "_");
      const storageRef = ref(storage, `sentOrders/${sentOrderId}/confirmations/${Date.now()}-${safeName}`);
      await uploadBytes(storageRef, file, { contentType: "application/pdf" });
      const pdfUrl = await getDownloadURL(storageRef);

      const payload = JSON.parse(JSON.stringify({
        ...parsed,
        fileName: file.name,
        pdfUrl,
        uploadedAt: Date.now(),
        uploadedBy,
        version: confirmations.length + 1,
      }));
      await addDoc(collection(db, "sentOrders", sentOrderId, "confirmations"), payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lese ordrebekreftelsen.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="confirmationPanel">
      <div className="confirmationHeader">
        <div>
          <h3>Ordrebekreftelse fra Moelven</h3>
          <p>Originalbestillingen beholdes. PDF-en leses og lagres som en egen bekreftelsesversjon.</p>
        </div>
        <label className={`uploadButton ${uploading ? "disabled" : ""}`}>
          {uploading ? "Leser PDF…" : "+ Last opp PDF"}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
      </div>

      {error && <div className="confirmationError">{error}</div>}
      {!latest && <div className="confirmationEmpty">Ingen ordrebekreftelse er lastet opp ennå.</div>}

      {latest && (
        <>
          <div className="confirmationMeta">
            <span><b>Versjon:</b> {latest.version}</span>
            <span><b>Moelven-ordre:</b> {latest.orderNumber || "–"}</span>
            <span><b>Leveringsdato:</b> {latest.deliveryDate || "–"}</span>
            <span><b>Lastet opp av:</b> {latest.uploadedBy}</span>
            <a href={latest.pdfUrl} target="_blank" rel="noreferrer">Åpne original PDF</a>
          </div>

          <div className="tableScroller">
            <table className="confirmationTable">
              <thead><tr><th>Pos.</th><th>NOBB</th><th>Produkt</th><th>Dimensjon</th><th>Lengde</th><th>Pakker</th><th>Stykk/meter</th><th>Netto</th></tr></thead>
              <tbody>
                {latest.lines.map((line) => (
                  <tr key={`${line.position}-${line.nobbNumber}`}>
                    <td>{line.position}</td><td>{line.nobbNumber}</td><td>{line.productType || line.rawDescription}</td><td>{line.dimension || "–"}</td><td>{line.length ? `${line.length} m` : "Fallende"}</td><td>{line.packages}</td><td>{line.pieces ? `${formatNumber(line.pieces)} stk` : line.meters ? `${formatNumber(line.meters)} m` : "–"}</td><td>{line.netAmount !== undefined ? `${formatNumber(line.netAmount, 2)} kr` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!!originalLines.length && (
            <div className="comparisonBlock">
              <h4>Endringer mot opprinnelig bestilling</h4>
              <div className="comparisonList">
                {comparison.map((row) => (
                  <div className={`comparisonRow ${row.status}`} key={row.key}>
                    <span className="comparisonStatus">{row.status === "same" ? "Lik" : row.status === "changed" ? "Antall endret" : row.status === "added" ? "Ny i bekreftelsen" : "Mangler"}</span>
                    <strong>{row.sample.dimension || "Ukjent dimensjon"} {row.sample.length ? `${row.sample.length} m` : ""}</strong>
                    <span>Bestilt: {row.orderedPackages} pk</span><span>Bekreftet: {row.confirmedPackages} pk</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {confirmations.length > 1 && <p className="confirmationHistory">{confirmations.length} bekreftelsesversjoner er lagret. Nyeste versjon vises.</p>}
        </>
      )}
    </section>
  );
}
