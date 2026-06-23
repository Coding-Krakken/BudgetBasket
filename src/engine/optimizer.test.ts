import { describe, it, expect } from "vitest";
import { matchProducts, getEligibleOpportunities } from "./optimizer";
import type { Opportunity, Product } from "@/types";

const makeProduct = (overrides: Partial<Product> & { id: string; slug: string; name: string }): Product => ({
  normalizedName: overrides.name.toLowerCase(),
  keywords: overrides.name.toLowerCase().split(" "),
  isOrganic: false,
  isPrivateLabel: false,
  ...overrides,
});

const PRODUCTS: Product[] = [
  makeProduct({ id: "p1", slug: "whole-milk-gallon", name: "Whole Milk 1 Gallon", category: { id: "c1", slug: "dairy", name: "Dairy & Eggs" } }),
  makeProduct({ id: "p2", slug: "eggs-large-dozen", name: "Large Grade A Eggs", keywords: ["eggs", "large eggs", "dozen"], category: { id: "c1", slug: "dairy", name: "Dairy & Eggs" } }),
  makeProduct({ id: "p3", slug: "cheerios-18oz", name: "Cheerios Original 18oz", keywords: ["cheerios", "cereal", "oats"], category: { id: "c2", slug: "cereal", name: "Cereal" }, brand: { id: "b1", slug: "general-mills", name: "General Mills" } }),
  makeProduct({ id: "p4", slug: "chicken-breast-boneless", name: "Boneless Skinless Chicken Breast", keywords: ["chicken", "chicken breast", "boneless"], category: { id: "c3", slug: "meat", name: "Meat" } }),
  makeProduct({ id: "p5", slug: "tide-pods-32ct", name: "Tide Pods Laundry Detergent 32ct", keywords: ["tide", "tide pods", "laundry", "detergent"] }),
];

describe("matchProducts", () => {
  it("finds exact match for milk", () => {
    const matches = matchProducts({ raw: "milk", normalized: "milk", quantity: 1 }, PRODUCTS);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].product.id).toBe("p1");
  });

  it("finds eggs with keyword match", () => {
    const matches = matchProducts({ raw: "eggs", normalized: "eggs", quantity: 1 }, PRODUCTS);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].product.id).toBe("p2");
  });

  it("finds cheerios by brand name", () => {
    const matches = matchProducts({ raw: "Cheerios", normalized: "cheerios", quantity: 1 }, PRODUCTS);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].product.id).toBe("p3");
  });

  it("finds chicken breast", () => {
    const matches = matchProducts({ raw: "chicken breast", normalized: "chicken breast", quantity: 1 }, PRODUCTS);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].product.id).toBe("p4");
  });

  it("finds laundry detergent via tide keywords", () => {
    const matches = matchProducts({ raw: "laundry detergent", normalized: "laundry detergent", quantity: 1 }, PRODUCTS);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].product.id).toBe("p5");
  });

  it("returns results sorted by confidence descending", () => {
    const matches = matchProducts({ raw: "milk", normalized: "milk", quantity: 1 }, PRODUCTS);
    for (let i = 0; i < matches.length - 1; i++) {
      expect(matches[i].confidence).toBeGreaterThanOrEqual(matches[i + 1].confidence);
    }
  });

  it("returns empty for unrecognized item", () => {
    const matches = matchProducts({ raw: "xyzzy123", normalized: "xyzzy123", quantity: 1 }, PRODUCTS);
    expect(matches).toHaveLength(0);
  });
});

const baseOpp = (overrides: Partial<Opportunity>): Opportunity => ({
  id: "opp-1",
  type: "STORE_SALE",
  title: "Test Offer",
  storeId: "store-1",
  productId: "p1",
  providerId: "seed-test",
  valueType: "FIXED_OFF",
  valueAmount: 1.00,
  minimumQuantity: 1,
  stackability: "STANDALONE",
  isMfgCoupon: false,
  requiresClipping: false,
  requiresLoyaltyCard: false,
  requiresAccount: false,
  requiresReceipt: false,
  confidenceLevel: "SEED_DEMO",
  confidence: 0.75,
  isActive: true,
  isVerified: false,
  isFeatured: false,
  ...overrides,
});

describe("getEligibleOpportunities", () => {
  const product = PRODUCTS[0]; // milk, category=dairy

  it("includes product-specific offers", () => {
    const opps = [baseOpp({ productId: "p1", storeId: null })];
    const result = getEligibleOpportunities(product, null, opps);
    expect(result).toHaveLength(1);
  });

  it("excludes offers for other products", () => {
    const opps = [baseOpp({ productId: "p2" })];
    const result = getEligibleOpportunities(product, null, opps);
    expect(result).toHaveLength(0);
  });

  it("includes category-wide offers when product matches", () => {
    const opps = [baseOpp({ productId: null, categorySlug: "dairy" })];
    const result = getEligibleOpportunities(product, null, opps);
    expect(result).toHaveLength(1);
  });

  it("excludes offers for different categories", () => {
    const opps = [baseOpp({ productId: null, categorySlug: "cleaning" })];
    const result = getEligibleOpportunities(product, null, opps);
    expect(result).toHaveLength(0);
  });

  it("excludes inactive offers", () => {
    const opps = [baseOpp({ isActive: false })];
    const result = getEligibleOpportunities(product, "store-1", opps);
    expect(result).toHaveLength(0);
  });

  it("excludes expired offers", () => {
    const opps = [baseOpp({ expiresAt: new Date(Date.now() - 1000) })];
    const result = getEligibleOpportunities(product, "store-1", opps);
    expect(result).toHaveLength(0);
  });

  it("includes store-specific offers for matching store", () => {
    const opps = [baseOpp({ storeId: "store-1", productId: "p1" })];
    const result = getEligibleOpportunities(product, "store-1", opps);
    expect(result).toHaveLength(1);
  });

  it("excludes store-specific offers for different store", () => {
    const opps = [baseOpp({ storeId: "store-2", productId: "p1" })];
    const result = getEligibleOpportunities(product, "store-1", opps);
    expect(result).toHaveLength(0);
  });
});
