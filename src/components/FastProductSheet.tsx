"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildMailName, type Category } from "@/data/products";

type Props = {
  category: Category;
  product: string;
  lengths: string[];
  initialQuantities: Record<string, number>;
  halfInvalid: boolean;
  onCommit: (deltas: Record<string, number>) => Promise<void> | void;
  onClose: () => void;
};

function FastProductSheetComponent({
  category,
  product,
  lengths,
  initialQuantities,
  halfInvalid,
  onCommit,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<Record<string, number>>(initialQuantities);
  const baselineRef = useRef<Record<string, number>>(initialQuantities);
  const draftRef = useRef<Record<string, number>>(initialQuantities);
  const timerRef = useRef<number | null>(null);
  const committingRef = useRef(false);

  useEffect(() => {
    setDraft(initialQuantities);
    baselineRef.current = initialQuantities;
    draftRef.current = initialQuantities;
  }, [category.name, product, initialQuantities]);

  const total = useMemo(
    () => Object.values(draft).reduce<number>((sum, qty) => sum + Number(qty), 0),
    [draft],
  );

  const isHalfProduct = category.name === "K-Virke Gran" && ["48x68", "48x98"].includes(product);

  const commitPending = useCallback(async () => {
    if (committingRef.current) return;

    const currentDraft = draftRef.current;
    const baseline = baselineRef.current;
    const deltas: Record<string, number> = {};

    lengths.forEach((length) => {
      const delta = (currentDraft[length] || 0) - (baseline[length] || 0);
      if (delta !== 0) deltas[length] = delta;
    });

    if (!Object.keys(deltas).length) return;

    committingRef.current = true;
    try {
      await onCommit(deltas);
      baselineRef.current = { ...currentDraft };
    } finally {
      committingRef.current = false;

      const stillDirty = lengths.some(
        (length) => (draftRef.current[length] || 0) !== (baselineRef.current[length] || 0),
      );
      if (stillDirty) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          void commitPending();
        }, 500);
      }
    }
  }, [lengths, onCommit]);

  const scheduleCommit = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void commitPending();
    }, 1200);
  }, [commitPending]);

  const change = useCallback((length: string, delta: number) => {
    setDraft((current) => {
      const nextQty = Math.max(0, (current[length] || 0) + delta);
      const next = { ...current, [length]: nextQty };
      draftRef.current = next;
      return next;
    });
    scheduleCommit();
  }, [scheduleCommit]);

  const close = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    await commitPending();
    onClose();
  }, [commitPending, onClose]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="sheetBackdrop" onClick={() => void close()}>
      <section className="productSheet fastProductSheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheetHandle" />
        <div className="sheetHeader">
          <div>
            <span className="eyebrow dark">{category.name}</span>
            <h2>{product}</h2>
            <p>{buildMailName(category.name, product)}</p>
          </div>
          <button className="secondary sheetClose" onClick={() => void close()}>Lukk</button>
        </div>

        <div className={`sheetTotal ${total ? "active" : ""} ${halfInvalid && isHalfProduct ? "danger" : ""}`}>
          <span>{halfInvalid && isHalfProduct ? "Halvpall-regel ikke oppfylt" : "Valgt på denne varen"}</span>
          <strong>{total} pk</strong>
        </div>

        <div className="sheetLengthList">
          {lengths.map((length) => {
            const qty = draft[length] || 0;
            const halfLengthInvalid = halfInvalid && isHalfProduct && length === "2,4";

            return (
              <div className={`sheetLengthRow ${qty ? "hasQty" : ""} ${halfLengthInvalid ? "halfInvalid" : ""}`} key={length}>
                <div>
                  <strong>{length === "Fallende" ? "Fallende lengder" : `${length} m`}</strong>
                  <span>{buildMailName(category.name, product)}</span>
                </div>
                <div className="sheetQty fastSheetQty">
                  <button className="minus" onPointerDown={(event) => { event.preventDefault(); change(length, -1); }}>−</button>
                  <b>{qty}</b>
                  <button className="plus" onPointerDown={(event) => { event.preventDefault(); change(length, 1); }}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export const FastProductSheet = memo(FastProductSheetComponent);
