export type OriginalOrderLine = {
  category: string;
  product: string;
  dimension: string;
  length: string;
  packages: number;
  material: "gran" | "impregnert";
  truckName: string;
};

export type MoelvenConfirmationLine = {
  position: number;
  deliveryDate?: string;
  nobbNumber: string;
  rawDescription: string;
  species?: string;
  dimension?: string;
  length?: string;
  productType?: string;
  packages: number;
  pieces?: number;
  meters?: number;
  price?: number;
  discountPercent?: number;
  netAmount?: number;
};

export type ParsedMoelvenConfirmation = {
  orderNumber?: string;
  orderDate?: string;
  customerId?: string;
  seller?: string;
  deliveryDate?: string;
  totalNet?: number;
  totalWeight?: number;
  totalVolume?: number;
  lines: MoelvenConfirmationLine[];
  rawText: string;
};

function norwegianNumber(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeLength(mm?: string) {
  if (!mm) return undefined;
  const n = Number(mm);
  if (!Number.isFinite(n)) return undefined;
  return (n / 1000).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function parseDescription(description: string) {
  const clean = description.replace(/\s+/g, " ").trim();
  const dimensionMatch = clean.match(/\b(\d{2,3})\s*[xX]\s*(\d{2,3})(?:\s*[xX]\s*(\d{4}))?\b/);
  const speciesMatch = clean.match(/\b(GRAN|FURU|G-F)\b/i);
  const dimension = dimensionMatch ? `${Number(dimensionMatch[1])}x${Number(dimensionMatch[2])}` : undefined;
  const length = dimensionMatch?.[3] ? normalizeLength(dimensionMatch[3]) : undefined;
  const speciesRaw = speciesMatch?.[1]?.toUpperCase();
  const species = speciesRaw === "G-F" ? "Gran/Furu" : speciesRaw === "GRAN" ? "Gran" : speciesRaw === "FURU" ? "Furu" : undefined;

  const upper = clean.toUpperCase();
  let productType: string | undefined;
  if (upper.includes("TERRASSE")) productType = "Terrassebord";
  else if (upper.includes("K-VIRKE")) productType = "K-Virke";
  else if (upper.includes("UNDERPANEL")) productType = "Underpanel";
  else if (upper.includes("KLED")) productType = "Kledning";
  else if (upper.includes("LEKT")) productType = "Lekt";

  return { dimension, length, species, productType };
}

export function parseMoelvenConfirmation(rawText: string): ParsedMoelvenConfirmation {
  const text = rawText.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const orderNumber = text.match(/Ordrenr:\s*([A-Z0-9-]+)/i)?.[1];
  const orderDate = text.match(/Ordredato:\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1];
  const customerId = text.match(/Kunde-ID:\s*(\d+)/i)?.[1];
  const seller = text.match(/Selger:\s*([^\n]+)/i)?.[1]?.trim();
  const totalNet = norwegianNumber(text.match(/Totalt netto:\s*NOK\s*([\d\s.,]+)/i)?.[1]);
  const totalWeight = norwegianNumber(text.match(/Total vekt\s*([\d\s.,]+)/i)?.[1]);
  const totalVolume = norwegianNumber(text.match(/Total Volum\s*([\d\s.,]+)/i)?.[1]);

  // Moelven line start: position, delivery date, NOBB/article number, package count.
  const starts = [...text.matchAll(/(?:^|\n)\s*(\d{1,3})\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{8})\s+(\d+)\s+pkg\b/gim)];
  const lines: MoelvenConfirmationLine[] = [];

  starts.forEach((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < starts.length ? (starts[index + 1].index || text.length) : text.length;
    const block = text.slice(start, end).replace(/\n(?:Kunde-ID:|Ordrebekreftelse|Moelven Wood AS)[\s\S]*$/i, "").trim();

    const pieces = Number(block.match(/(\d[\d\s]*)\s+PCS\b/i)?.[1]?.replace(/\s/g, ""));
    const meters = norwegianNumber(block.match(/([\d\s.,]+)\s+m\b/i)?.[1]);
    const moneyTriplet = block.match(/([\d\s]+,\d{2})\s+(\d{1,2},\d{2})%\s+([\d\s]+,\d{2})/);

    // Description is generally between the commercial values and PCS/metres.
    let description = block;
    if (moneyTriplet) description = description.replace(moneyTriplet[0], " ");
    description = description
      .replace(/^\s*\d+\s*/m, " ")
      .replace(/\b\d[\d\s]*\s+PCS\b/gi, " ")
      .replace(/\b[\d\s.,]+\s+m\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const meta = parseDescription(description);
    lines.push({
      position: Number(match[1]),
      deliveryDate: match[2],
      nobbNumber: match[3],
      packages: Number(match[4]),
      rawDescription: description,
      ...meta,
      pieces: Number.isFinite(pieces) ? pieces : undefined,
      meters,
      price: norwegianNumber(moneyTriplet?.[1]),
      discountPercent: norwegianNumber(moneyTriplet?.[2]),
      netAmount: norwegianNumber(moneyTriplet?.[3]),
    });
  });

  return {
    orderNumber,
    orderDate,
    customerId,
    seller,
    deliveryDate: lines[0]?.deliveryDate,
    totalNet,
    totalWeight,
    totalVolume,
    lines,
    rawText: text,
  };
}

export function normalizedLineKey(dimension?: string, length?: string) {
  const dim = (dimension || "").toLowerCase().replace(/\s/g, "");
  const len = (length || "").replace(".", ",").replace(/\s/g, "");
  return `${dim}__${len}`;
}
