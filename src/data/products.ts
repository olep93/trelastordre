export type Material = "gran" | "impregnert";

export type Category = {
  name: string;
  material: Material;
  icon: string;
  falling?: boolean;
  fixedLengths?: string[];
  products: string[];
};

export const STANDARD_LENGTHS = ["3,6", "3,9", "4,2", "4,8", "5,1", "5,4"];

export const MODULE_TARGETS = [
  { id: "A", label: "15 imp + 10 gran", gran: 10, imp: 15 },
  { id: "B", label: "10 imp + 20 gran", gran: 20, imp: 10 },
];

export const categories: Category[] = [
  {
    name: "K-Virke Gran",
    material: "gran",
    icon: "G",
    products: [
      "23x48", "30x48", "36x48", "48x48", "36x68", "36x73", "36x98",
      "36x148", "36x198", "48x68", "48x98", "48x148", "48x198",
    ],
  },
  {
    name: "Lekt / Rekke Gran – Bunt",
    material: "gran",
    icon: "B",
    fixedLengths: ["4,8"],
    products: ["11x36", "23x48", "30x48", "36x48", "48x48"],
  },
  {
    name: "K-Virke Impregnert",
    material: "impregnert",
    icon: "I",
    products: [
      "23x48", "30x48", "36x48", "48x48", "36x73", "48x73",
      "36x98", "36x148", "36x198", "48x98", "48x148", "48x198",
      "73x73", "98x98",
    ],
  },
  {
    name: "Kledning Gran",
    material: "gran",
    icon: "K",
    falling: true,
    products: [
      "16x98 Rektangulærkledning Grunnet",
      "19x98 Rektangulærkledning Ubehandlet",
      "19x98 Rektangulærkledning Grunnet",
      "19x98 Rektangulærkledning Malt",
      "19x123 Rektangulærkledning Ubehandlet",
      "19x123 Rektangulærkledning Grunnet",
      "19x148 Rektangulærkledning Ubehandlet",
      "19x123 Rektangulærkledning Malt",
      "19x148 Rektangulærkledning Grunnet",
      "19x148 Rektangulærkledning Malt",
      "19x148 Skråskåret Grunnet",
      "19x145 Sveitserkledning D-Fals Grunnet e-fas",
      "19x148 D-Fals 28° Grunnet",
      "19x148 D-Fals 28° Malt",
      "19x148 D-Fals 60° Malt",
      "19x148 D-Fals 60° Grunnet",
      "19x148 D-Fals 60° M/Spor Grunnet",
      "22x148 Rektangulærkledning Grunnet",
      "22x148 Rektangulærkledning Malt",
      "22x173 Rektangulærkledning Grunnet",
      "22x198 Rektangulærkledning Ubehandlet",
      "15x120 Underpanel",
      "18x120 Underpanel",
    ],
  },
  {
    name: "Kledning Impregnert",
    material: "impregnert",
    icon: "K",
    falling: true,
    products: [
      "19x148 D-Fals 28°",
      "19x98 Rektangulærkledning",
      "19x123 Rektangulærkledning",
      "19x148 Rektangulærkledning",
      "22x173 Rektangulærkledning",
      "22x198 Rektangulærkledning",
    ],
  },
  {
    name: "Terrassebord / Altan / Vannbrett Impregnert",
    material: "impregnert",
    icon: "T",
    falling: true,
    products: [
      "26x115 varmebehandlet terrassebord",
      "26x140 varmebehandlet terrassebord",
      "28x120 Terrassebord",
      "28x120 RoyalBrun Riller",
      "28x120 RoyalBrun Slett",
      "21x95 terrassebord",
      "28x145 terrassebord",
      "34x145 altan Toppbord",
      "45x70 vannbrett",
      "45x95 vannbrett",
    ],
  },
];

export function buildMailName(categoryName: string, displayName: string) {
  if (categoryName === "K-Virke Gran") return `${displayName} Gran`;
  if (categoryName === "Lekt / Rekke Gran – Bunt") return `${displayName} Gran Bunt`;
  if (categoryName === "K-Virke Impregnert") return `${displayName} Impregnert`;
  if (categoryName === "Kledning Impregnert") return `${displayName} Impregnert`;

  if (categoryName === "Terrassebord / Altan / Vannbrett Impregnert") {
    if (/royalbrun/i.test(displayName)) return displayName;
    if (/varmebehandlet/i.test(displayName)) return displayName;
    return `${displayName} Impregnert`;
  }

  return displayName;
}

export function lengthsFor(category: Category, displayName: string) {
  if (category.fixedLengths) return [...category.fixedLengths];

  const lengths = [...STANDARD_LENGTHS];

  if (category.name === "K-Virke Gran" && ["36x68", "48x68", "48x98"].includes(displayName)) {
    lengths.unshift("2,4");
  }

  if (
    category.falling ||
    (category.name === "K-Virke Impregnert" && ["73x73", "98x98"].includes(displayName))
  ) {
    lengths.push("Fallende");
  }

  return lengths;
}

// Produktene i dagens bestillingskatalog er kontrollert mot Moelvens
// sortimentsavtale av 01.04.2026. Nye kategorier skal ikke telle mot
// modulvogn før de uttrykkelig legges til her.
const MODULE_AGREEMENT_PRODUCTS: Record<string, Set<string>> = {
  "K-Virke Gran": new Set(categories.find((category) => category.name === "K-Virke Gran")?.products || []),
  "K-Virke Impregnert": new Set([
    "23x48", "30x48", "36x48", "48x48", "36x73", "48x73",
    "36x98", "36x148", "36x198", "48x98", "48x148", "48x198",
  ]),
  "Lekt / Rekke Gran – Bunt": new Set(["11x36", "23x48", "30x48", "36x48", "48x48"]),
  "Kledning Gran": new Set(categories.find((category) => category.name === "Kledning Gran")?.products || []),
  "Kledning Impregnert": new Set(categories.find((category) => category.name === "Kledning Impregnert")?.products || []),
  "Terrassebord / Altan / Vannbrett Impregnert": new Set([
    "21x95 terrassebord",
    "28x120 Terrassebord",
    "28x145 terrassebord",
  ]),
};

export function contributesToModule(categoryName: string, displayName: string) {
  return MODULE_AGREEMENT_PRODUCTS[categoryName]?.has(displayName) ?? false;
}
