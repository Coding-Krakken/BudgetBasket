import { describe, it, expect } from "vitest";
import { parseShoppingList, normalizeShoppingItem, normalizeProductName, itemSimilarity } from "./parser";

describe("parseShoppingList", () => {
  it("parses comma-separated items", () => {
    const result = parseShoppingList("milk, eggs, bread");
    expect(result).toHaveLength(3);
    expect(result[0].raw).toBe("milk");
    expect(result[1].raw).toBe("eggs");
    expect(result[2].raw).toBe("bread");
  });

  it("parses newline-separated items", () => {
    const result = parseShoppingList("milk\neggs\nbread");
    expect(result).toHaveLength(3);
  });

  it("parses mixed separators", () => {
    const result = parseShoppingList("milk, eggs\nbread; butter");
    expect(result).toHaveLength(4);
  });

  it("returns empty for empty input", () => {
    expect(parseShoppingList("")).toHaveLength(0);
    expect(parseShoppingList("   ")).toHaveLength(0);
  });

  it("handles the demo shopping list", () => {
    const result = parseShoppingList("milk, eggs, chicken breast, Cheerios, bananas, toothpaste, laundry detergent");
    expect(result).toHaveLength(7);
    expect(result[0].normalized).toBe("milk");
    expect(result[2].normalized).toBe("chicken breast");
  });

  it("extracts quantities", () => {
    const result = parseShoppingList("2 gallons milk, 3 eggs");
    expect(result[0].quantity).toBe(2);
    expect(result[1].quantity).toBe(3);
  });

  it("handles fractional quantities", () => {
    const result = parseShoppingList("0.5 lb ground beef");
    expect(result[0].quantity).toBe(0.5);
  });
});

describe("normalizeShoppingItem", () => {
  it("normalizes a simple item", () => {
    const item = normalizeShoppingItem("Whole Milk");
    expect(item.normalized).toBe("whole milk");
    expect(item.quantity).toBe(1);
  });

  it("extracts unit from item", () => {
    const item = normalizeShoppingItem("2 gallons milk");
    expect(item.quantity).toBe(2);
    expect(item.unit).toBe("gal");
    expect(item.normalized).toBe("milk");
  });

  it("extracts notes from parentheses", () => {
    const item = normalizeShoppingItem("milk (organic preferred)");
    expect(item.notes).toBe("organic preferred");
    expect(item.normalized).toBe("milk");
  });

  it("handles number words", () => {
    const item = normalizeShoppingItem("two dozen eggs");
    expect(item.quantity).toBe(2);
  });
});

describe("normalizeProductName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeProductName("Whole Milk (1 gal.)")).toBe("whole milk 1 gal");
  });

  it("handles empty string", () => {
    expect(normalizeProductName("")).toBe("");
  });

  it("removes extra spaces", () => {
    expect(normalizeProductName("  large  eggs  ")).toBe("large eggs");
  });
});

describe("itemSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(itemSimilarity("milk", "milk")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    const score = itemSimilarity("milk", "toothpaste");
    expect(score).toBeLessThan(0.1);
  });

  it("returns positive score for partial match", () => {
    const score = itemSimilarity("chicken breast", "boneless chicken breast");
    expect(score).toBeGreaterThan(0.3);
  });

  it("handles cereal name match", () => {
    const score = itemSimilarity("cheerios", "cheerios original");
    expect(score).toBeGreaterThanOrEqual(0.5);
  });
});
