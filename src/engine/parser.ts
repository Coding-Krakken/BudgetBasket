import type { ShoppingListItem } from "@/types";

const UNIT_ALIASES: Record<string, string> = {
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  oz: "oz", ounce: "oz", ounces: "oz",
  gal: "gal", gallon: "gal", gallons: "gal",
  ct: "ct", count: "ct", pack: "pk", pk: "pk",
  liter: "L", liters: "L", l: "L",
  dozen: "doz", doz: "doz",
  bag: "bag", box: "box", bottle: "bottle", can: "can", jar: "jar",
};

const QUANTITY_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, some: 1,
};

const NOISE_WORDS = new Set([
  "organic", "fresh", "large", "small", "medium", "extra", "super",
  "please", "need", "want", "get", "buy", "pick", "up",
  "some", "a", "an", "the", "my", "our",
]);

export function parseShoppingList(input: string): ShoppingListItem[] {
  if (!input.trim()) return [];

  const lines = input
    .split(/[\n,;]+/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  return lines.map(normalizeShoppingItem);
}

export function normalizeShoppingItem(raw: string): ShoppingListItem {
  let working = raw.toLowerCase().trim();

  // Extract quantity (number or word)
  let quantity = 1;
  const numMatch = working.match(/^(\d+(?:\.\d+)?)\s*/);
  if (numMatch) {
    quantity = parseFloat(numMatch[1]);
    working = working.slice(numMatch[0].length);
  } else {
    for (const [word, val] of Object.entries(QUANTITY_WORDS)) {
      const re = new RegExp(`^${word}\\s+`, "i");
      if (re.test(working)) {
        quantity = val;
        working = working.replace(re, "");
        break;
      }
    }
  }

  // Extract unit if present
  let unit: string | undefined;
  const unitPattern = new RegExp(
    `^(${Object.keys(UNIT_ALIASES).join("|")})(?:\\s|$|\\.)`,
    "i"
  );
  const unitMatch = working.match(unitPattern);
  if (unitMatch) {
    unit = UNIT_ALIASES[unitMatch[1].toLowerCase()];
    working = working.slice(unitMatch[0].length).trim();
  }

  // Strip trailing notes in parens
  let notes: string | undefined;
  const parenMatch = working.match(/\(([^)]+)\)$/);
  if (parenMatch) {
    notes = parenMatch[1].trim();
    working = working.replace(/\s*\([^)]+\)$/, "").trim();
  }

  // Normalize the name
  const normalized = normalizeProductName(working);

  return {
    raw,
    normalized,
    quantity,
    unit,
    notes,
  };
}

export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 0)
    .join(" ")
    .trim();
}

export function extractKeywords(normalized: string): string[] {
  return normalized
    .split(/\s+/)
    .filter(w => w.length > 1 && !NOISE_WORDS.has(w));
}

export function itemSimilarity(a: string, b: string): number {
  const aWords = new Set(extractKeywords(a));
  const bWords = new Set(extractKeywords(b));

  if (aWords.size === 0 || bWords.size === 0) return 0;

  const aArr = Array.from(aWords);
  const bArr = Array.from(bWords);
  const intersection = aArr.filter(w => bWords.has(w));
  const unionSize = new Set(aArr.concat(bArr)).size;

  // Jaccard similarity
  return intersection.length / unionSize;
}
