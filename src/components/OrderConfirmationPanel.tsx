"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { MoelvenConfirmationLine } from "@/lib/moelven-parser";
import { extractPdfText } from "@/lib/pdf-text";

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
  year: number;
  week: number;
  lagerOrderNumber?: number;
  uploadedBy: string;
  originalLines?: ArchivedOrderLine[];
};

function productKey(dimension: string, length: string) {
  return `${dimension.toLowerCase().replace(/\s/g, "")}__${length.replace(".", ",")}`;
}

function money(value?: number) {
  if (value == null) return "–";
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(value);
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function OrderConfirmationPanel({ sentOrderId, year, week, lagerOrderNumber, uploadedBy, originalLines = [] }: Props) {
  const [confirmations, setConfirmations] = useState<ConfirmationRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ref = collection(db, "sentOrders", sentOrderId, "confirmations");
    return onSnapshot(query(ref, orderBy("uploadedAt", "desc")), (snapshot) => {
      setConfirmations(snapshot.docs.map((document) => ({ id: document.id, ...(document.data() as Omit<ConfirmationRecord, "id">) })));
    });
  }, [sentOrderId]);

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
      form.append("year", String(year));
      form.append("week", String(week));
      form.append("lagerOrderNumber", String(lagerOrderNumber || "ukjent"));

      const response = await fetch("/api/order-confirmations/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Opplastingen feilet.");

      await addDoc(collection(db, "sentOrders", sentOrderId, "confirmations"), {
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
          {uploading ? "Leser og lagrer PDF …" : confirmations.length ? "Last opp ny versjon" : "Last opp PDF"}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(event) => upload(event.target.files?.[0])} />
        </label>
      </div>

      {error && <div className="confirmationError">{error}</div>}
      {!confirmations.length && !uploading && <div className="confirmationEmpty">Ingen ordrebekreftelse er lastet opp ennå.</div>}

      {confirmations.map((confirmation, index) => (
        <ConfirmationView
          key={confirmation.id}
          confirmation={confirmation}
          originalLines={originalLines}
          current={index === 0}
        />
      ))}
    </section>
  );
}

function ConfirmationView({ confirmation, originalLines, current }: { confirmation: ConfirmationRecord; originalLines: ArchivedOrderLine[]; current: boolean }) {
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
    <details className="confirmationCard" open={current}>
      <summary>
        <div>
          <strong>Ordrebekreftelse {confirmation.version} {current && <span className="currentBadge">Gjeldende</span>}</strong>
          <span>{confirmation.fileName} · {fileSize(confirmation.fileSize)} · lastet opp av {confirmation.uploadedBy}</span>
        </div>
      </summary>

      <div className="confirmationMeta">
        <span><b>Moelven-ordre:</b> {confirmation.orderNumber || "–"}</span>
        <span><b>Ordredato:</b> {confirmation.orderDate || "–"}</span>
        <span><b>Leveringsdato:</b> {confirmation.deliveryDate || "–"}</span>
        <span><b>Netto:</b> {money(confirmation.totalNet)}</span>
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
        <table className="confirmationTable">
          <thead>
            <tr><th>Pos.</th><th>NOBB</th><th>Kategori</th><th>Dimensjon</th><th>Lengde</th><th>Pakker</th><th>Antall</th><th>Netto</th></tr>
          </thead>
          <tbody>
            {confirmation.lines.map((line) => (
              <tr key={`${line.position}-${line.articleNumber}`}>
                <td>{line.position}</td>
                <td>{line.articleNumber}</td>
                <td>{line.category}</td>
                <td>{line.dimension}</td>
                <td>{line.length === "Fallende" ? line.length : `${line.length} m`}</td>
                <td>{line.packages}</td>
                <td>{line.quantity.toLocaleString("nb-NO")} {line.quantityUnit}</td>
                <td>{money(line.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
