"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { MoelvenConfirmationLine } from "@/lib/moelven-parser";
import { extractPdfText } from "@/lib/pdf-text";
import { storeCollectionPath } from "@/lib/enterprise";

export type ArchivedOrderLine = {
  category: string;
  dimension: string;
  length: string;
  packages: number;
  material: "gran" | "impregnert";
  truckName: string;
};

type ConfirmationRecord = {
  id?: string;
  version: number;
  uploadedAt: number;
  uploadedBy: string;
  fileName: string;
  pathname: string;
  fileSize: number;
  orderNumber?: string;
  orderDate?: string;
  deliveryDate?: string;
  totalNet?: number;
  totalWeight?: number;
  totalVolume?: number;
  lines: MoelvenConfirmationLine[];
};

type Props = {
  sentOrderId: string;
  storeId: string;
  year: number;
  week: number;
  lagerOrderNumber?: number;
  uploadedBy: string;
  originalLines?: ArchivedOrderLine[];
  onStatusChange?: (sentOrderId: string, status: ConfirmationStatus) => void;
};

export type ConfirmationStatus = {
  count: number;
  orderNumbers: string[];
};

function productKey(dimension: string, length: string) {
  return `${dimension.toLowerCase().replace(/\s/g, "")}__${length.replace(".", ",")}`;
}


function displayProductName(line: MoelvenConfirmationLine) {
  if (line.productName) return line.productName;

  const upper = (line.description || "").toUpperCase();
  let base = "Trelast";
  if (upper.includes("TERRASSE")) base = "Terrassebord kl. 1";
  else if (upper.includes("UNDERPANEL")) base = "Underpanel";
  else if (upper.includes("REKTKLED")) base = "Rektangulær kledning";
  else if (upper.includes("K-VIRKE C24")) base = "K-virke C24";
  else if (upper.includes("LEKT BNT")) base = "Lekt bunt";
  else if (upper.includes("LEKT")) base = "Lekt";

  const material = line.material === "impregnert" ? "impregnert" : line.material === "gran" ? "gran" : "";
  const length = line.length === "Fallende" ? "fallende lengder" : `${line.length} m`;
  return [base, material, line.dimension, length].filter(Boolean).join(" ");
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

type CombinedLine = MoelvenConfirmationLine & {
  sourceOrderNumbers: string[];
};

function combineConfirmationLines(confirmations: ConfirmationRecord[]) {
  const combined = new Map<string, CombinedLine>();

  confirmations.forEach((confirmation) => {
    confirmation.lines.forEach((line) => {
      const key = line.articleNumber || `${productKey(line.dimension, line.length)}__${line.quantityUnit}`;
      const existing = combined.get(key);
      const orderNumber = confirmation.orderNumber;

      if (!existing) {
        combined.set(key, {
          ...line,
          packages: line.packages || 0,
          quantity: line.quantity || 0,
          sourceOrderNumbers: orderNumber ? [orderNumber] : [],
        });
        return;
      }

      existing.packages += line.packages || 0;
      existing.quantity += line.quantity || 0;
      if (orderNumber && !existing.sourceOrderNumbers.includes(orderNumber)) existing.sourceOrderNumbers.push(orderNumber);
    });
  });

  return Array.from(combined.values()).sort((a, b) =>
    `${a.category} ${displayProductName(a)}`.localeCompare(`${b.category} ${displayProductName(b)}`, "nb-NO"),
  );
}

export function OrderConfirmationPanel({ sentOrderId, storeId, year, week, lagerOrderNumber, uploadedBy, originalLines = [], onStatusChange }: Props) {
  const [confirmations, setConfirmations] = useState<ConfirmationRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const combinedLines = useMemo(() => combineConfirmationLines(confirmations), [confirmations]);

  useEffect(() => {
    const ref = collection(db, `${storeCollectionPath(storeId, "sentOrders")}/${sentOrderId}/confirmations`);
    return onSnapshot(query(ref, orderBy("uploadedAt", "desc")), (snapshot) => {
      const records = snapshot.docs.map((document) => ({ id: document.id, ...(document.data() as Omit<ConfirmationRecord, "id">) }));
      setConfirmations(records);
      onStatusChange?.(sentOrderId, {
        count: records.length,
        orderNumbers: Array.from(new Set(records.map((record) => record.orderNumber).filter((value): value is string => Boolean(value)))),
      });
    });
  }, [onStatusChange, sentOrderId, storeId]);

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rawText = await extractPdfText(bytes);
      if (!rawText.trim()) throw new Error("PDF-en inneholder ingen lesbar tekst.");

      const form = new FormData();
      form.append("file", file);
      form.append("rawText", rawText);
      form.append("sentOrderId", sentOrderId);
      form.append("storeId", storeId);
      form.append("year", String(year));
      form.append("week", String(week));
      form.append("lagerOrderNumber", String(lagerOrderNumber || "ukjent"));

      const response = await fetch("/api/order-confirmations/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Opplastingen feilet.");

      await addDoc(collection(db, `${storeCollectionPath(storeId, "sentOrders")}/${sentOrderId}/confirmations`), {
        version: confirmations.length + 1,
        uploadedAt: Date.now(),
        uploadedBy: uploadedBy || "Ukjent bruker",
        fileName: result.file.fileName,
        pathname: result.file.pathname,
        fileSize: result.file.size,
        orderNumber: result.parsed.orderNumber || null,
        orderDate: result.parsed.orderDate || null,
        deliveryDate: result.parsed.deliveryDate || null,
        totalNet: result.parsed.totalNet ?? null,
        totalWeight: result.parsed.totalWeight ?? null,
        totalVolume: result.parsed.totalVolume ?? null,
        lines: result.parsed.lines,
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Opplastingen feilet.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="confirmationSection">
      <div className="confirmationHeader">
        <div>
          <h3>Ordrebekreftelse fra Moelven</h3>
          <p>PDF-en leses automatisk. Opprinnelig bestilling beholdes uendret.</p>
        </div>
        <label className={`uploadButton ${uploading ? "disabled" : ""}`}>
          {uploading ? "Leser og lagrer PDF …" : confirmations.length ? "Legg til en PDF" : "Last opp PDF"}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(event) => upload(event.target.files?.[0])} />
        </label>
      </div>

      {error && <div className="confirmationError">{error}</div>}
      {!confirmations.length && !uploading && <div className="confirmationEmpty">Ingen ordrebekreftelse er lastet opp ennå.</div>}

      {!!confirmations.length && (
        <div className="confirmationCount">
          <strong>{confirmations.length} {confirmations.length === 1 ? "ordrebekreftelse" : "ordrebekreftelser"}</strong>
          <span>Alle PDF-er beholdes på denne lagerordren.</span>
        </div>
      )}

      {!!combinedLines.length && (
        <div className="combinedConfirmation">
          <div className="combinedConfirmationHeader">
            <div>
              <h4>Samlet ordrebekreftelse</h4>
              <p>Summert fra {confirmations.length} {confirmations.length === 1 ? "PDF" : "PDF-er"} · {combinedLines.length} varelinjer</p>
            </div>
            <strong>{combinedLines.reduce((sum, line) => sum + line.packages, 0)} pakker</strong>
          </div>
          <div className="confirmationTableWrap combinedTableWrap">
            <table className="confirmationTable combinedConfirmationTable">
              <thead><tr><th>Vare</th><th>Pakker</th><th>Antall</th></tr></thead>
              <tbody>
                {combinedLines.map((line) => (
                  <tr key={line.articleNumber || `${line.dimension}-${line.length}-${line.quantityUnit}`}>
                    <td className="confirmationProductCell">
                      <strong>{displayProductName(line)}</strong>
                      <span className="combinedProductMeta">
                        NOBB {line.articleNumber || "–"}
                        {line.sourceOrderNumbers.length > 0 && ` · Moelven ${line.sourceOrderNumbers.join(", ")}`}
                      </span>
                    </td>
                    <td className="combinedNumber"><strong>{line.packages}</strong><span> pk</span></td>
                    <td className="combinedNumber"><strong>{line.quantity.toLocaleString("nb-NO")}</strong><span> {line.quantityUnit}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Totalt fra PDF-ene</td><td>{combinedLines.reduce((sum, line) => sum + line.packages, 0)} pk</td><td></td></tr></tfoot>
            </table>
          </div>
        </div>
      )}

      {!!confirmations.length && <h4 className="sourceDocumentsTitle">Originale PDF-er</h4>}

      {confirmations.map((confirmation) => (
        <ConfirmationView
          key={confirmation.id}
          confirmation={confirmation}
          originalLines={originalLines}
        />
      ))}
    </section>
  );
}

function ConfirmationView({ confirmation, originalLines }: { confirmation: ConfirmationRecord; originalLines: ArchivedOrderLine[] }) {
  const comparison = useMemo(() => {
    const original = new Map<string, number>();
    originalLines.forEach((line) => original.set(productKey(line.dimension, line.length), (original.get(productKey(line.dimension, line.length)) || 0) + line.packages));
    const confirmed = new Map<string, number>();
    confirmation.lines.forEach((line) => confirmed.set(productKey(line.dimension, line.length), (confirmed.get(productKey(line.dimension, line.length)) || 0) + line.packages));

    const keys = new Set([...original.keys(), ...confirmed.keys()]);
    return Array.from(keys).map((key) => {
      const [dimension, length] = key.split("__");
      const ordered = original.get(key) || 0;
      const accepted = confirmed.get(key) || 0;
      const status = !ordered ? "Ny" : !accepted ? "Mangler" : ordered === accepted ? "Lik" : "Endret";
      return { key, dimension, length, ordered, accepted, status };
    });
  }, [confirmation.lines, originalLines]);

  const hasOriginal = originalLines.length > 0;
  return (
    <details className="confirmationCard">
      <summary>
        <div>
          <strong>{confirmation.orderNumber ? `Moelven-ordre ${confirmation.orderNumber}` : `Ordrebekreftelse ${confirmation.version}`}</strong>
          <span>{confirmation.fileName} · {fileSize(confirmation.fileSize)} · lastet opp av {confirmation.uploadedBy}</span>
        </div>
      </summary>

      <div className="confirmationMeta">
        <span><b>Moelven-ordre:</b> {confirmation.orderNumber || "–"}</span>
        <span><b>Ordredato:</b> {confirmation.orderDate || "–"}</span>
        <span><b>Leveringsdato:</b> {confirmation.deliveryDate || "–"}</span>
        <a className="secondaryLink" href={`/api/order-confirmations/file?pathname=${encodeURIComponent(confirmation.pathname)}`} target="_blank" rel="noreferrer">Åpne PDF</a>
      </div>

      {hasOriginal && (
        <div className="comparisonBlock">
          <h4>Endringer mot bestillingen</h4>
          <div className="confirmationTableWrap">
            <table className="confirmationTable compactTable">
              <thead><tr><th>Dimensjon</th><th>Lengde</th><th>Bestilt</th><th>Bekreftet</th><th>Status</th></tr></thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.key} className={`diff-${row.status.toLowerCase()}`}>
                    <td>{row.dimension}</td><td>{row.length} m</td><td>{row.ordered} pk</td><td>{row.accepted} pk</td><td><span className="diffBadge">{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!hasOriginal && <div className="legacyNotice">Denne eldre arkivordren har ikke strukturerte original-linjer. Moelven-linjene vises, men automatisk sammenligning er ikke tilgjengelig.</div>}

      <h4>Lest fra ordrebekreftelse fra Moelven</h4>
      <div className="confirmationTableWrap">
        <table className="confirmationTable productConfirmationTable">
          <thead>
            <tr><th>Pos.</th><th>Vare</th><th>Pakker</th><th>Antall</th></tr>
          </thead>
          <tbody>
            {confirmation.lines.map((line) => (
              <tr key={`${line.position}-${line.articleNumber}`}>
                <td className="positionCell">{line.position}</td>
                <td className="confirmationProductCell">
                  <strong>{displayProductName(line)}</strong>
                  <span className="confirmationProductMeta">
                    <span className="categoryPill">{line.category}</span>
                    <span>NOBB {line.articleNumber}</span>
                  </span>
                </td>
                <td className="numericCell"><strong>{line.packages}</strong><span>pk</span></td>
                <td className="numericCell"><strong>{line.quantity.toLocaleString("nb-NO")}</strong><span>{line.quantityUnit}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
