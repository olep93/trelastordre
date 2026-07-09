"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { categories, lengthsFor, buildMailName, type Category, type Material } from "@/data/products";
import { db } from "@/firebase/config";

const RECIPIENT = "post@wood.no";
const STORE_NAME = "Obs Bygg Tønsberg";

type Truck = {
  id: string;
  name: string;
  items: Record<string, number>;
};

type WeeklyOrder = {
  id: string;
  year: number;
  week: number;
  storeName: string;
  recipient: string;
  trucks: Truck[];
  updatedAt: number;
  createdAt: number;
  lastEditedBy?: string;
  lastEditedAt?: number;
};

type Line = {
  category: string;
  displayName: string;
  mailName: string;
  length: string;
  qty: number;
  material: Material;
};

type SentOrder = {
  id?: string;
  orderId: string;
  year: number;
  week: number;
  sentAt: number;
  sentBy: string;
  subject: string;
  body: string;
  totalPackages: number;
  totalLines: number;
  lagerOrderNumber?: number;
};

type LogEntry = {
  id?: string;
  orderId: string;
  timestamp: number;
  userName: string;
  text: string;
  action: string;
};

type PresenceUser = {
  id: string;
  name: string;
  lastSeen: number;
};

type SelectedProduct = {
  category: Category;
  product: string;
};

function randomId(prefix = "t") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

function orderIdForCurrentWeek() {
  const { year, week } = getWeekNumber();
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function freshOrder(): WeeklyOrder {
  const { year, week } = getWeekNumber();
  const now = Date.now();
  return {
    id: orderIdForCurrentWeek(),
    year,
    week,
    storeName: STORE_NAME,
    recipient: RECIPIENT,
    trucks: [{ id: randomId(), name: "Bil 1", items: {} }],
    createdAt: now,
    updatedAt: now,
  };
}

function lineKey(category: string, product: string, length: string) {
  return `${category}__${product}__${length}`;
}

function parseLineKey(key: string) {
  const parts = key.split("__");
  return {
    category: parts[0],
    displayName: parts[1],
    length: parts.slice(2).join("__"),
  };
}

function metaFor(categoryName: string, product: string) {
  const category = categories.find((c) => c.name === categoryName);
  if (!category) return null;
  return {
    material: category.material,
    mailName: buildMailName(categoryName, product),
    lengths: lengthsFor(category, product),
  };
}

function lengthSort(length: string) {
  if (length === "Fallende") return 99;
  return Number(length.replace(",", "."));
}

function truckLines(truck: Truck): Line[] {
  return Object.entries(truck.items)
    .map(([key, qty]) => {
      const parsed = parseLineKey(key);
      const meta = metaFor(parsed.category, parsed.displayName);
      if (!meta || !qty) return null;
      return {
        category: parsed.category,
        displayName: parsed.displayName,
        mailName: meta.mailName,
        length: parsed.length,
        qty,
        material: meta.material,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const x = a as Line;
      const y = b as Line;
      return (
        x.category.localeCompare(y.category, "nb") ||
        x.mailName.localeCompare(y.mailName, "nb") ||
        lengthSort(x.length) - lengthSort(y.length)
      );
    }) as Line[];
}

function countForTruck(truck: Truck) {
  const lines = truckLines(truck);
  const gran = lines.filter((l) => l.material === "gran").reduce((sum, l) => sum + l.qty, 0);
  const imp = lines.filter((l) => l.material === "impregnert").reduce((sum, l) => sum + l.qty, 0);
  return { gran, imp, total: gran + imp, lines: lines.length };
}

function countAll(order: WeeklyOrder) {
  const lines = order.trucks.flatMap(truckLines);
  const gran = lines.filter((l) => l.material === "gran").reduce((sum, l) => sum + l.qty, 0);
  const imp = lines.filter((l) => l.material === "impregnert").reduce((sum, l) => sum + l.qty, 0);
  return { gran, imp, total: gran + imp, lines: lines.length };
}

function is28x120Terrasse(line: Line) {
  return (
    line.category === "Terrassebord / Altan / Vannbrett Impregnert" &&
    /28x120/i.test(line.displayName) &&
    /terrassebord/i.test(line.displayName) &&
    !/royal/i.test(line.displayName)
  );
}

function only28x120Terrasse(truck: Truck) {
  const lines = truckLines(truck);
  return lines.length > 0 && lines.every((line) => line.material === "impregnert" && is28x120Terrasse(line));
}

function halfPalletCount(truck: Truck) {
  return truckLines(truck)
    .filter((line) => line.category === "K-Virke Gran" && line.length === "2,4" && ["48x68", "48x98"].includes(line.displayName))
    .reduce((sum, line) => sum + line.qty, 0);
}

function halfPalletStatus(truck: Truck) {
  const count = halfPalletCount(truck);
  const ok = count === 0 || count % 2 === 0;
  return {
    count,
    ok,
    text: ok ? "Halvpall OK" : "48x68/48x98 2,4 m må bestilles to halvplasser av gangen.",
  };
}

const BASE_TARGETS = [
  { id: "G20I10", label: "20 gran + 10 imp", gran: 20, imp: 10 },
  { id: "G10I15", label: "10 gran + 15 imp", gran: 10, imp: 15 },
  { id: "I16", label: "16 imp + 0 gran", gran: 0, imp: 16 },
  { id: "I22T", label: "22 imp + 0 gran kun 28x120 terrassebord", gran: 0, imp: 22 },
];

function progress(target: { gran: number; imp: number }, gran: number, imp: number) {
  const missingGran = Math.max(0, target.gran - gran);
  const missingImp = Math.max(0, target.imp - imp);
  const overGran = Math.max(0, gran - target.gran);
  const overImp = Math.max(0, imp - target.imp);
  const hit = missingGran === 0 && missingImp === 0 && overGran === 0 && overImp === 0;
  let text = hit
    ? "Klar"
    : overGran || overImp
      ? `Over med ${overGran} gran / ${overImp} impregnert`
      : `Mangler ${missingGran} gran / ${missingImp} impregnert`;
  return { hit, text, missingGran, missingImp, overGran, overImp };
}

function moduleStatus(truck: Truck) {
  const count = countForTruck(truck);
  const half = halfPalletStatus(truck);
  const terrasseOnly = only28x120Terrasse(truck);

  const targets = BASE_TARGETS.map((target) => {
    const p = progress(target, count.gran, count.imp);
    const invalidTerrasse = target.id === "I22T" && !terrasseOnly;
    const score = p.missingGran + p.missingImp + (p.overGran + p.overImp) * 2 + (invalidTerrasse ? 100 : 0);
    return { ...target, ...p, invalidTerrasse, score };
  });

  const exact = targets.find((t) => t.hit && !t.invalidTerrasse && half.ok);
  if (exact) {
    return { ok: true, title: "Modulvogntog klart", text: `Treffer ${exact.label}`, target: exact, targets, half };
  }

  const nearest = [...targets].sort((a, b) => a.score - b.score)[0];

  if (!half.ok) {
    return { ok: false, title: "Mangler halvplass", text: half.text, target: nearest, targets, half };
  }

  if (count.total === 0) {
    return { ok: false, title: "Neste rutebil", text: "Velg varer for å starte.", target: nearest, targets, half };
  }

  return {
    ok: false,
    title: "Neste rutebil",
    text: nearest.invalidTerrasse ? "22 imp-regelen krever kun 28x120 terrassebord." : nearest.text,
    target: nearest,
    targets,
    half,
  };
}

function orderText(order: WeeklyOrder) {
  const hasLines = order.trucks.some((truck) => truckLines(truck).length);
  if (!hasLines) return "";

  let text = "Hei,\n\nJeg ønsker å bestille følgende varer:\n\n";

  order.trucks.forEach((truck) => {
    const lines = truckLines(truck);
    if (!lines.length) return;

    const count = countForTruck(truck);
    const status = moduleStatus(truck);

    text += `${truck.name}:\n`;
    text += `Transport: ${status.ok ? "Modul vogntog" : "Neste rutebil"}\n`;
    text += `Status: ${count.gran} pk gran / ${count.imp} pk impregnert / ${count.total} pk totalt\n`;
    if (status.ok) text += `Modul: ${status.target.label}\n`;
    else text += `Merk: ${status.text}\n`;
    if (!status.half.ok) text += `OBS: ${status.half.text}\n`;
    text += "\n";

    categories.forEach((category) => {
      const catLines = lines.filter((line) => line.category === category.name);
      if (!catLines.length) return;

      text += `${category.name}:\n`;
      catLines.forEach((line) => {
        const length = line.length === "Fallende" ? "Fallende lengder" : `${line.length} m`;
        text += `- ${line.mailName} ${length} - ${line.qty} pk\n`;
      });
      text += "\n";
    });
  });

  const total = countAll(order);
  text += "Total oppsummering:\n";
  text += `- Gran: ${total.gran} pk\n`;
  text += `- Impregnert: ${total.imp} pk\n`;
  text += `- Totalt: ${total.total} pk\n\n`;
  text += "Mvh\n";

  return text;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
}

function relative(timestamp: number) {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} sek siden`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min siden`;
  return `${Math.round(minutes / 60)} t siden`;
}

function orderRef() {
  return doc(db, "orders", orderIdForCurrentWeek());
}

async function ensureOrder() {
  const fresh = freshOrder();
  const ref = orderRef();
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) await setDoc(ref, fresh);
}

export default function Page() {
  const [order, setOrder] = useState<WeeklyOrder>(freshOrder());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [userReady, setUserReady] = useState(false);

  const [activeTruckIndex, setActiveTruckIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryOpen, setCategoryOpen] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<SelectedProduct | null>(null);
  const [toast, setToast] = useState("");
  const [sentOrders, setSentOrders] = useState<SentOrder[]>([]);
  const [view, setView] = useState<"order" | "archive" | "stats">("order");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  useEffect(() => {
    let id = localStorage.getItem("trelastordre-user-id");
    if (!id) {
      id = randomId("u");
      localStorage.setItem("trelastordre-user-id", id);
    }

    const name = localStorage.getItem("trelastordre-user-name") || "";
    setUserId(id);
    setUserName(name);
    setUserReady(true);
  }, []);

  useEffect(() => {
    let unsubOrder: (() => void) | undefined;
    let unsubArchive: (() => void) | undefined;
    let unsubLogs: (() => void) | undefined;
    let unsubPresence: (() => void) | undefined;

    async function start() {
      await ensureOrder();

      unsubOrder = onSnapshot(orderRef(), (snap) => {
        if (snap.exists()) setOrder(snap.data() as WeeklyOrder);
        setLoading(false);
      });

      unsubArchive = onSnapshot(
        query(collection(db, "sentOrders"), orderBy("sentAt", "desc"), limit(30)),
        (snap) => setSentOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SentOrder, "id">) }))),
      );

      unsubLogs = onSnapshot(
        query(collection(db, "changeLogs", orderIdForCurrentWeek(), "entries"), orderBy("timestamp", "desc"), limit(12)),
        (snap) => setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LogEntry, "id">) }))),
      );

      unsubPresence = onSnapshot(
        query(collection(db, "presence"), orderBy("lastSeen", "desc"), limit(20)),
        (snap) => setPresence(snap.docs.map((d) => d.data() as PresenceUser)),
      );
    }

    start().catch(() => setLoading(false));

    return () => {
      unsubOrder?.();
      unsubArchive?.();
      unsubLogs?.();
      unsubPresence?.();
    };
  }, []);

  useEffect(() => {
    if (!userId || !userName) return;

    const update = () => setDoc(doc(db, "presence", userId), { id: userId, name: userName, lastSeen: Date.now() }, { merge: true });
    update();
    const interval = window.setInterval(update, 30000);
    return () => window.clearInterval(interval);
  }, [userId, userName]);

  const activeTruck = order.trucks[Math.min(activeTruckIndex, Math.max(0, order.trucks.length - 1))] || order.trucks[0];
  const activeCount = activeTruck ? countForTruck(activeTruck) : { gran: 0, imp: 0, total: 0, lines: 0 };
  const activeStatus = activeTruck ? moduleStatus(activeTruck) : null;
  const total = countAll(order);
  const preview = orderText(order);
  const halfInvalid = activeTruck ? !halfPalletStatus(activeTruck).ok : false;
  const halfCount = activeTruck ? halfPalletCount(activeTruck) : 0;

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1700);
  }

  function saveName() {
    const clean = nameInput.trim();
    if (!clean) return;
    localStorage.setItem("trelastordre-user-name", clean);
    setUserName(clean);
    if (userId) setDoc(doc(db, "presence", userId), { id: userId, name: clean, lastSeen: Date.now() }, { merge: true });
  }

  async function updateOrder(
    updater: (current: WeeklyOrder) => {
      next: WeeklyOrder;
      logText?: string;
      action?: string;
    },
  ) {
    setSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const ref = orderRef();
        const snap = await transaction.get(ref);
        const current = snap.exists() ? (snap.data() as WeeklyOrder) : freshOrder();
        const result = updater(current);
        const now = Date.now();

        transaction.set(ref, { ...result.next, updatedAt: now, lastEditedBy: userName, lastEditedAt: now }, { merge: true });

        if (result.logText) {
          const logRef = doc(collection(db, "changeLogs", orderIdForCurrentWeek(), "entries"));
          transaction.set(logRef, {
            orderId: orderIdForCurrentWeek(),
            timestamp: now,
            userName,
            action: result.action || "edit",
            text: result.logText,
          });
        }
      });
    } finally {
      setSaving(false);
    }
  }

  function addTruck() {
    updateOrder((current) => {
      const nextIndex = current.trucks.length;
      setActiveTruckIndex(nextIndex);
      return {
        next: {
          ...current,
          trucks: [...current.trucks, { id: randomId(), name: `Bil ${current.trucks.length + 1}`, items: {} }],
        },
        action: "addTruck",
        logText: `opprettet Bil ${current.trucks.length + 1}`,
      };
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetOrder() {
    if (!confirm("Vil du nullstille aktiv ukeordre for alle brukere?")) return;
    updateOrder((current) => ({
      next: {
        ...current,
        trucks: [{ id: randomId(), name: "Bil 1", items: {} }],
      },
      action: "reset",
      logText: "nullstilte aktiv ukeordre",
    }));
    setActiveTruckIndex(0);
  }

  function resetActiveOrderAfterSent(nextLagerOrderNumber: number) {
    updateOrder((current) => ({
      next: {
        ...current,
        trucks: [{ id: randomId(), name: "Bil 1", items: {} }],
      },
      action: "startNewLagerOrder",
      logText: `startet Lagerordre ${nextLagerOrderNumber}`,
    }));
    setActiveTruckIndex(0);
  }

  function changeQty(category: string, product: string, length: string, delta: number) {
    if (delta > 0 && activeStatus?.ok) {
      const proceed = confirm(`${activeTruck.name} er allerede modulvogn-klar. Vil du opprette ny bil og legge varen der i stedet?`);
      if (!proceed) return;

      updateOrder((current) => {
        const newTruckIndex = current.trucks.length;
        const newTruck: Truck = { id: randomId(), name: `Bil ${newTruckIndex + 1}`, items: { [lineKey(category, product, length)]: 1 } };
        setActiveTruckIndex(newTruckIndex);

        return {
          next: { ...current, trucks: [...current.trucks, newTruck] },
          action: "addTruck",
          logText: `opprettet ${newTruck.name} og la til 1 pk ${product} ${length === "Fallende" ? "Fallende lengder" : `${length} m`}`,
        };
      });
      return;
    }

    updateOrder((current) => {
      const index = Math.min(activeTruckIndex, Math.max(0, current.trucks.length - 1));
      let resultQty = 0;
      const truckName = current.trucks[index]?.name || `Bil ${index + 1}`;

      const trucks = current.trucks.map((truck, truckIndex) => {
        if (truckIndex !== index) return truck;

        const items = { ...truck.items };
        const key = lineKey(category, product, length);
        const next = Math.max(0, (items[key] || 0) + delta);
        resultQty = next;

        if (next <= 0) delete items[key];
        else items[key] = next;

        return { ...truck, items };
      });

      const lengthText = length === "Fallende" ? "Fallende lengder" : `${length} m`;

      return {
        next: { ...current, trucks },
      };
    });
  }

  async function archiveSent(openMode: "outlook" | "mailto" | "none") {
    if (!preview) return showToast("Ingen varer valgt");
    if (order.trucks.some((truck) => !halfPalletStatus(truck).ok)) {
      return showToast("Halvpall-regel må rettes før sending");
    }

    const lagerOrderNumber = currentLagerOrderNumber();
    const subject = `Lagerordre ${lagerOrderNumber} - Bestilling uke ${order.week} ${STORE_NAME}`;

    await addDoc(collection(db, "sentOrders"), {
      orderId: order.id,
      year: order.year,
      week: order.week,
      sentAt: Date.now(),
      sentBy: userName,
      subject,
      body: preview,
      totalPackages: total.total,
      totalLines: total.lines,
      lagerOrderNumber,
    } satisfies Omit<SentOrder, "id">);

    await addDoc(collection(db, "changeLogs", orderIdForCurrentWeek(), "entries"), {
      orderId: order.id,
      timestamp: Date.now(),
      userName,
      action: "send",
      text: `sendte/arkiverte Lagerordre ${lagerOrderNumber} (${total.total} pk)`,
    });

    showToast(`Lagerordre ${lagerOrderNumber} arkivert som sendt`);
    resetActiveOrderAfterSent(lagerOrderNumber + 1);

    if (openMode === "outlook") {
      const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(RECIPIENT)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(preview)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } else if (openMode === "mailto") {
      const mailto = `mailto:${RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(preview)}`;
      window.location.href = mailto;
    }
  }

  async function copyOrder() {
    if (!preview) return showToast("Ingen varer valgt");
    await navigator.clipboard.writeText(preview);
    showToast("Bestilling kopiert");
  }


  function exportSentOrderCsv(sent: SentOrder) {
    const rows = [
      ["Emne", sent.subject],
      ["Sendt", formatTime(sent.sentAt)],
      ["Sendt av", sent.sentBy],
      ["Pakker", String(sent.totalPackages)],
      ["Linjer", String(sent.totalLines)],
      [],
      ["Bestilling"],
      ...sent.body.split("\n").map((line) => [line]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sent.subject.replace(/[^\wæøåÆØÅ-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAllArchiveCsv() {
    const rows = [
      ["Sendt", "Sendt av", "Emne", "Pakker", "Linjer", "Bestilling"],
      ...sentOrders.map((sent) => [
        formatTime(sent.sentAt),
        sent.sentBy,
        sent.subject,
        String(sent.totalPackages),
        String(sent.totalLines),
        sent.body.replace(/\n/g, " | "),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Sendte_bestillinger_trelastordre.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function archiveStats() {
    const totalSent = sentOrders.length;
    const totalPackages = sentOrders.reduce((sum, order) => sum + order.totalPackages, 0);
    const totalLines = sentOrders.reduce((sum, order) => sum + order.totalLines, 0);
    const avgPackages = totalSent ? Math.round(totalPackages / totalSent) : 0;
    return { totalSent, totalPackages, totalLines, avgPackages };
  }

  function currentWeekSentOrders() {
    return sentOrders.filter((sent) => sent.week === order.week && sent.year === order.year);
  }

  function currentLagerOrderNumber() {
    const numbers = currentWeekSentOrders()
      .map((sent) => sent.lagerOrderNumber || 0)
      .filter(Boolean);

    if (!numbers.length) return currentWeekSentOrders().length + 1;
    return Math.max(...numbers) + 1;
  }

  function productQty(category: Category, product: string) {
    if (!activeTruck) return 0;
    return lengthsFor(category, product).reduce((sum, length) => sum + (activeTruck.items[lineKey(category.name, product, length)] || 0), 0);
  }

  if (userReady && !userName) {
    return (
      <main className="nameGate">
        <section className="nameCard">
          <Image src="/obs-bygg-logo.png" alt="Obs BYGG" width={120} height={80} />
          <span className="eyebrow dark">Trelastordre Enterprise</span>
          <h1>Hva heter du?</h1>
          <p>Navnet lagres på denne enheten og brukes i endringslogg, arkiv og online-status.</p>
          <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="F.eks. Ole eller Kristoffer" autoFocus />
          <button className="primary" disabled={!nameInput.trim()} onClick={saveName}>Fortsett</button>
        </section>
      </main>
    );
  }

  if (loading || !userReady || !activeTruck || !activeStatus) {
    return (
      <main className="loadingScreen">
        <Image src="/obs-bygg-logo.png" alt="Obs BYGG" width={120} height={80} />
        <h1>Laster Trelastordre</h1>
        <p>Kobler til Firebase...</p>
      </main>
    );
  }

  return (
    <>
      <header className="appHeader">
        <div className="headerInner">
          <Image className="logo" src="/obs-bygg-logo.png" alt="Obs BYGG" width={92} height={58} priority />
          <div className="headerText">
            <h1>Trelastordre</h1>
            <p>Uke {order.week} · {saving ? "Lagrer..." : "Live i Firebase"}</p>
          </div>
          <button className="iconButton dangerSoft" onClick={resetOrder}>Nullstill</button>
        </div>
      </header>

      <main className="app">
        <section className="presenceBar">
          <div>
            <strong>Hei, {userName} 👋</strong>
            <span>Felles liveordre · sist endret av {order.lastEditedBy || "ingen ennå"}</span>
          </div>
          <div className="presenceUsers">
            {presence.slice(0, 6).map((user) => {
              const online = Date.now() - user.lastSeen < 90000;
              return <span key={user.id} className={online ? "online" : ""}>{online ? "●" : "○"} {user.name}</span>;
            })}
            <button className="textButton" onClick={() => { localStorage.removeItem("trelastordre-user-name"); setUserName(""); }}>Endre navn</button>
          </div>
        </section>

        <nav className="appTabs">
          <button className={view === "order" ? "active" : ""} onClick={() => setView("order")}>Aktiv ordre</button>
          <button className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}>Sendte bestillinger</button>
          <button className={view === "stats" ? "active" : ""} onClick={() => setView("stats")}>Statistikk</button>
        </nav>

        {view === "order" && (
          <>
        <section className="dashboard">
          <div className="dashboardHeader">
            <div>
              <span className="eyebrow">Aktiv liveordre</span>
              <h2>Lagerordre {currentLagerOrderNumber()}</h2>
              <p>Uke {order.week} · {STORE_NAME} · {total.total} pakker · {total.lines} linjer</p>
            </div>
            <button className="primary" onClick={addTruck}>+ Ny bil</button>
          </div>

          <div className="truckCardGrid">
            {order.trucks.map((truck, index) => {
              const count = countForTruck(truck);
              const status = moduleStatus(truck);
              return (
                <button key={truck.id} className={`visualTruckCard ${index === activeTruckIndex ? "active" : ""} ${status.ok ? "complete" : ""} ${!status.half.ok ? "invalid" : ""}`} onClick={() => setActiveTruckIndex(index)}>
                  <div className="truckCardTop">
                    <div className="truckIcon">🚚</div>
                    <div>
                      <strong>{truck.name}</strong>
                      <span>{status.title}</span>
                    </div>
                  </div>

                  <div className="miniTargets">
                    {status.targets.map((target) => (
                      <div key={target.id} className={`miniTarget ${target.hit && !target.invalidTerrasse ? "hit" : ""}`}>
                        <span>{target.label}</span>
                        <b>{target.invalidTerrasse ? "Kun 28x120" : target.text}</b>
                      </div>
                    ))}
                  </div>

                  <Progress value={count.gran} target={status.target.gran} label="Gran" />
                  <Progress value={count.imp} target={status.target.imp} label="Imp" />

                  {!status.half.ok && <div className="halfWarning">Mangler 1 halvplass 2,4 m</div>}

                  <div className="truckFooter">
                    <span>{count.lines} linjer</span>
                    <strong>{count.total} pk</strong>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="heroPanel">
          <div className="counterGrid">
            <article className="counterCard">
              <span className="label">Aktiv bil</span>
              <strong>{activeTruck.name}</strong>
              <small>{activeCount.lines} linjer / {activeCount.total} pakker</small>
            </article>
            <article className="counterCard">
              <span className="label">Gran</span>
              <strong>{activeCount.gran}</strong>
              <small>pakker i aktiv bil</small>
            </article>
            <article className="counterCard">
              <span className="label">Impregnert</span>
              <strong>{activeCount.imp}</strong>
              <small>pakker i aktiv bil</small>
            </article>
            <article className={`moduleCard ${activeStatus.ok ? "ok" : activeCount.total ? "warn" : ""}`}>
              <div>
                <span className="label">Modulvogntog</span>
                <strong>{activeStatus.title}</strong>
                <small>{activeStatus.text}</small>
              </div>
            </article>
          </div>

          {!activeStatus.half.ok && (
            <div className="validationBanner danger">
              <strong>Halvpall-regel</strong>
              <span>{activeStatus.half.text} Nå: {halfCount} halvplass(er).</span>
            </div>
          )}
        </section>

        <section className="toolBar">
          <div className="searchWrap">
            <span>🔎</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søk: 48x98, terrassebord, vannbrett..." />
          </div>
        </section>

        <section className="products">
          {categories.map((category) => {
            const queryText = search.trim().toLowerCase();
            const visible = category.products.filter((product) => {
              const mailName = buildMailName(category.name, product).toLowerCase();
              return !queryText || product.toLowerCase().includes(queryText) || category.name.toLowerCase().includes(queryText) || mailName.includes(queryText);
            });
            if (!visible.length) return null;
            const isOpen = queryText ? true : categoryOpen[category.name] ?? true;
            const categoryTotal = visible.reduce((sum, product) => sum + productQty(category, product), 0);

            return (
              <section className={`category ${isOpen ? "" : "closed"}`} key={category.name}>
                <button className="categoryHeader stickyCategoryHeader" onClick={() => setCategoryOpen((current) => ({ ...current, [category.name]: !(current[category.name] ?? true) }))}>
                  <div className="categoryTitle">
                    <div className="categoryIcon">{category.icon}</div>
                    <div>
                      <h2>{category.name}</h2>
                      <small>{visible.length} varer · {categoryTotal} pk valgt</small>
                    </div>
                  </div>
                  <small>{isOpen ? "Lukk" : "Åpne"}</small>
                </button>

                <div className="categoryBody productListOnly">
                  {visible.map((product) => {
                    const qty = productQty(category, product);
                    const halfProduct = category.name === "K-Virke Gran" && ["48x68", "48x98"].includes(product);
                    return (
                      <button key={`${category.name}-${product}`} className={`productRow ${qty ? "hasQty" : ""} ${halfInvalid && halfProduct ? "halfInvalid" : ""}`} onClick={() => setSelected({ category, product })}>
                        <div className="productRowMain">
                          <strong>{product}</strong>
                          <span>{buildMailName(category.name, product)}</span>
                        </div>
                        <div className="productRowSide">
                          <b>{qty}</b>
                          <span>pk</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>

        <section className="exportPanel" id="export">
          <div className="exportHeader">
            <div>
              <h2>Bestilling</h2>
              <p>{total.lines} linjer / {total.total} pakker totalt / {order.trucks.length} bil(er)</p>
            </div>
            <div className="mailBadge">{RECIPIENT}</div>
          </div>

          <textarea readOnly value={preview} placeholder="Bestillingen vises her når du velger varer." />

          <div className="bottomActions quad">
            <button className="primary" onClick={() => archiveSent("outlook")}>Åpne i Outlook Web + merk sendt</button>
            <button className="secondary" onClick={() => archiveSent("mailto")}>E-postapp + merk sendt</button>
            <button className="secondary" onClick={copyOrder}>Kopier</button>
            <button className="secondary" onClick={() => archiveSent("none")}>Kun merk sendt</button>
          </div>
          <p className="exportHint">Outlook Web åpner Outlook i nettleser. E-postapp bruker standard e-postapp på enheten.</p>
        </section>

        <section className="activityPanel">
          <div className="activityHeader">
            <h2>Siste aktivitet</h2>
            <p>{logs.length ? "Viktige hendelser. Pakketelling loggføres ikke for ytelse." : "Ingen aktivitet ennå"}</p>
          </div>
          <div className="activityList">
            {logs.slice(0, 6).map((log) => (
              <div className="activityItem" key={log.id}>
                <div className="activityDot" />
                <div>
                  <strong>{log.userName}</strong>
                  <span>{log.text}</span>
                  <small>{relative(log.timestamp)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

          </>
        )}

        {view === "archive" && (
        <section className="archivePanel openArchive" id="archive">
          <button className="archiveHeader" onClick={() => setArchiveOpen((v) => !v)}>
            <div>
              <h2>Sendte bestillinger</h2>
              <p>{sentOrders.length ? `${sentOrders.length} siste arkiverte` : "Ingen sendte bestillinger ennå"}</p>
            </div>
            <span>{archiveOpen ? "Lukk" : "Åpne"}</span>
          </button>

          {archiveOpen && (
            <div className="archiveList">
              {sentOrders.length === 0 && <div className="emptyArchive">Send en bestilling for å få historikk her.</div>}
              {sentOrders.map((sent) => (
                <details className="archiveItem" key={sent.id}>
                  <summary>
                    <div>
                      <strong>Lagerordre {sent.lagerOrderNumber || "?"} · {sent.subject}</strong>
                      <span>{formatTime(sent.sentAt)} · sendt av {sent.sentBy} · {sent.totalPackages} pk · {sent.totalLines} linjer</span>
                    </div>
                  </summary>
                  <textarea readOnly value={sent.body} />
                  <div className="archiveActions">
                    <button className="secondary" onClick={() => exportSentOrderCsv(sent)}>Eksporter til Excel/CSV</button>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
        )}

        {view === "stats" && (
          <section className="statsPanel">
            <div className="statsHeader">
              <h2>Statistikk</h2>
              <p>Basert på sendte bestillinger i arkivet.</p>
            </div>
            <div className="statsGrid">
              <article>
                <span>Sendte bestillinger</span>
                <strong>{archiveStats().totalSent}</strong>
              </article>
              <article>
                <span>Pakker totalt</span>
                <strong>{archiveStats().totalPackages}</strong>
              </article>
              <article>
                <span>Varelinjer totalt</span>
                <strong>{archiveStats().totalLines}</strong>
              </article>
              <article>
                <span>Snitt pakker per ordre</span>
                <strong>{archiveStats().avgPackages}</strong>
              </article>
            </div>
            <button className="primary" onClick={exportAllArchiveCsv} disabled={!sentOrders.length}>Eksporter all historikk til Excel/CSV</button>
          </section>
        )}
      </main>

      <aside className="stickyStatus">
        <div>
          <strong>{activeTruck.name}</strong>
          <span>{activeCount.gran} gran / {activeCount.imp} imp / {activeCount.total} pk</span>
        </div>
        <div className={`stickyModule ${activeStatus.ok ? "ok" : !activeStatus.half.ok ? "danger" : ""}`}>{activeStatus.ok ? "Modulvogntog klart" : !activeStatus.half.ok ? "Halvplass" : "Neste rutebil"}</div>
      </aside>

      <nav className="mobileDock">
        <button onClick={() => setView("order")}>Ordre</button>
        <button onClick={() => setView("archive")}>Arkiv</button>
        <button onClick={() => setView("stats")}>Statistikk</button>
      </nav>

      {selected && (
        <div className="sheetBackdrop" onClick={() => setSelected(null)}>
          <section className="productSheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHandle" />
            <div className="sheetHeader">
              <div>
                <span className="eyebrow dark">{selected.category.name}</span>
                <h2>{selected.product}</h2>
                <p>{buildMailName(selected.category.name, selected.product)}</p>
              </div>
              <button className="secondary sheetClose" onClick={() => setSelected(null)}>Lukk</button>
            </div>

            <div className={`sheetTotal ${productQty(selected.category, selected.product) ? "active" : ""} ${halfInvalid && selected.category.name === "K-Virke Gran" && ["48x68", "48x98"].includes(selected.product) ? "danger" : ""}`}>
              <span>{halfInvalid && selected.category.name === "K-Virke Gran" && ["48x68", "48x98"].includes(selected.product) ? "Halvpall-regel ikke oppfylt" : "Valgt på denne varen"}</span>
              <strong>{productQty(selected.category, selected.product)} pk</strong>
            </div>

            <div className="sheetLengthList">
              {lengthsFor(selected.category, selected.product).map((length) => {
                const qty = activeTruck.items[lineKey(selected.category.name, selected.product, length)] || 0;
                const halfProduct = selected.category.name === "K-Virke Gran" && ["48x68", "48x98"].includes(selected.product) && length === "2,4";
                return (
                  <div className={`sheetLengthRow ${qty ? "hasQty" : ""} ${halfInvalid && halfProduct ? "halfInvalid" : ""}`} key={length}>
                    <div>
                      <strong>{length === "Fallende" ? "Fallende lengder" : `${length} m`}</strong>
                      <span>{buildMailName(selected.category.name, selected.product)}</span>
                    </div>
                    <div className="sheetQty">
                      <button className="minus" onClick={() => changeQty(selected.category.name, selected.product, length, -1)}>−</button>
                      <b>{qty}</b>
                      <button className="plus" onClick={() => changeQty(selected.category.name, selected.product, length, 1)}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </>
  );
}

function Progress({ value, target, label }: { value: number; target: number; label: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  const full = value === target;
  const over = value > target;

  return (
    <div className="progressBlock">
      <div className="progressMeta">
        <span>{label}</span>
        <strong className={full ? "okText" : over ? "warnText" : ""}>{value}/{target}</strong>
      </div>
      <div className="progressTrack">
        <div className={`progressFill ${full ? "ok" : over ? "over" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
