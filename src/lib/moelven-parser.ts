export type MoelvenConfirmationLine = {
  position: number;
  deliveryDate: string;
  articleNumber: string;
  description: string;
  productName: string;
  dimension: string;
  length: string;
  packages: number;
  quantity: number;
  quantityUnit: "PCS" | "m";
  price?: number;
  discountPercent?: number;
  netAmount?: number;
  material: "gran" | "impregnert" | "ukjent";
  category: string;
};

export type MoelvenConfirmation = {
  orderNumber?: string;
  orderDate?: string;
  customerId?: string;
  deliveryDate?: string;
  totalNet?: number;
  totalWeight?: number;
  totalVolume?: number;
  lines: MoelvenConfirmationLine[];
  rawText: string;
};

function parseNorwegianNumber(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeLength(mm?: string) {
  if (!mm) return "Fallende";
  const meters = Number(mm) / 1000;
  return meters.toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}


function buildProductName(description: string, material: "gran" | "impregnert" | "ukjent", dimension: string, length: string) {
  const upper = description.toUpperCase();
  let base = "Trelast";

  if (upper.includes("TERRASSE")) base = "Terrassebord kl. 1";
  else if (upper.includes("UNDERPANEL")) base = "Underpanel";
  else if (upper.includes("REKTKLED")) base = "Rektangulær kledning";
  else if (upper.includes("K-VIRKE C24")) base = "K-virke C24";
  else if (upper.includes("LEKT BNT")) base = "Lekt bunt";
  else if (upper.includes("LEKT")) base = "Lekt";

  const materialName = material === "impregnert" ? "impregnert" : material === "gran" ? "gran" : "";
  const lengthName = length === "Fallende" ? "fallende lengder" : `${length} m`;
  return [base, materialName, dimension, lengthName].filter(Boolean).join(" ");
}

function inferCategory(description: string, material: "gran" | "impregnert" | "ukjent") {
  const upper = description.toUpperCase();
  if (upper.includes("TERRASSE")) return "Terrassebord / Altan / Vannbrett Impregnert";
  if (upper.includes("KLED") || upper.includes("UNDERPANEL")) {
    return material === "impregnert" ? "Kledning Impregnert" : "Kledning Gran";
  }
  return material === "impregnert" ? "K-Virke Impregnert" : "K-Virke Gran";
}

export function parseMoelvenText(rawText: string): MoelvenConfirmation {
  const text = rawText.replace(/\r/g, "").replace(/\u00a0/g, " ");
  const headerPattern = /(?:^|\n)(\d+)\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{8})\s+(\d+)\s+pkg\s+([^\n]+)/g;
  const matches = Array.from(text.matchAll(headerPattern));
  const lines: MoelvenConfirmationLine[] = [];

  matches.forEach((match, index) => {
    const blockStart = (match.index || 0) + match[0].length;
    const blockEnd = index + 1 < matches.length ? (matches[index + 1].index || text.length) : text.length;
    const block = `${match[5]}\n${text.slice(blockStart, blockEnd)}`;

    const productMatch = block.match(/(?:G-F|GRAN|FURU)\s+(\d{2})X(\d{3})(?:X(\d{4}))?\s+([\d ]+)\s+(PCS|m)(?:\s|$)/i);
    if (!productMatch) return;

    const material: "gran" | "impregnert" | "ukjent" = /\bCU\b|IMPREGNERT/i.test(block)
      ? "impregnert"
      : /GRAN|G-F/i.test(block)
        ? "gran"
        : "ukjent";

    const firstLineNumbers = match[5].match(/([\d ]+,\d{2})\s+([\d ]+,\d{2})%\s+([\d ]+,\d{2})/);
    const description = block
      .split("\n")
      .slice(0, 5)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const dimension = `${Number(productMatch[1])}x${Number(productMatch[2])}`;
    const length = normalizeLength(productMatch[3]);

    lines.push({
      position: Number(match[1]),
      deliveryDate: match[2],
      articleNumber: match[3],
      packages: Number(match[4]),
      description,
      productName: buildProductName(description, material, dimension, length),
      dimension,
      length,
      quantity: Number(productMatch[4].replace(/\s/g, "")),
      quantityUnit: productMatch[5].toUpperCase() === "PCS" ? "PCS" : "m",
      price: parseNorwegianNumber(firstLineNumbers?.[1]),
      discountPercent: parseNorwegianNumber(firstLineNumbers?.[2]),
      netAmount: parseNorwegianNumber(firstLineNumbers?.[3]),
      material,
      category: inferCategory(description, material),
    });
  });

  const orderNumber = text.match(/Ordrenr:\s*\n?\s*([A-Z]\d+)/i)?.[1];
  const orderDate = text.match(/Ordredato:\s*\n?\s*(\d{2}\.\d{2}\.\d{4})/i)?.[1];
  const customerId = text.match(/Kunde-ID:\s*\n?\s*(\d+)/i)?.[1];
  const totalNet = parseNorwegianNumber(text.match(/Totalt netto:\s*NOK\s*([\d .]+,\d{2})/i)?.[1]);
  const totalWeight = parseNorwegianNumber(text.match(/Total vekt\s*([\d .]+,\d{2})/i)?.[1]);
  const totalVolume = parseNorwegianNumber(text.match(/Total Volum\s*([\d .]+,\d{2})/i)?.[1]);

  return {
    orderNumber,
    orderDate,
    customerId,
    deliveryDate: lines[0]?.deliveryDate,
    totalNet,
    totalWeight,
    totalVolume,
    lines,
    rawText: text,
  };
}
