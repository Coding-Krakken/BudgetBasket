/**
 * Provider Contract Tests
 *
 * Every concrete BaseProvider implementation must pass these tests.
 * Add new providers to the PROVIDERS array below — the contract test
 * runs against all of them automatically.
 */

import { describe, it, expect } from "vitest";
import type { BaseProvider, ProviderOpportunityData, ProviderPriceData } from "./base";
import { EnvCredentialStore } from "./credential-store";
import { LiveKrogerProvider } from "./live-kroger";
import { LiveFlippProvider } from "./live-flipp";
import { LiveSlickdealsProvider } from "./live-slickdeals";
import { LiveIbottaProvider } from "./live-ibotta";
import { LiveFetchRewardsProvider } from "./live-fetch-rewards";
import { LiveWalmartDealsProvider } from "./live-walmart-deals";

const MOCK_PRODUCTS = [
  { id: "p1", slug: "whole-milk-gallon", name: "Whole Milk 1 Gallon", normalizedName: "whole milk 1 gallon" },
  { id: "p2", slug: "eggs-large-dozen", name: "Large Grade A Eggs", normalizedName: "large grade a eggs" },
  { id: "p3", slug: "chicken-breast-boneless", name: "Boneless Skinless Chicken Breast", normalizedName: "boneless skinless chicken breast" },
];

const MOCK_STORES = [
  { id: "s1", slug: "walmart", name: "Walmart" },
  { id: "s2", slug: "aldi", name: "Aldi" },
];

// All concrete providers to contract-test
const PROVIDERS: BaseProvider[] = [
  new LiveWalmartDealsProvider(),
  new LiveFlippProvider(),
  new LiveSlickdealsProvider(),
  new LiveIbottaProvider(),
  new LiveFetchRewardsProvider(),
  new LiveKrogerProvider(new EnvCredentialStore({}), (() => {
    throw new Error("fetch should not be called without credentials");
  }) as unknown as typeof fetch),
];

// ─── Field validators ────────────────────────────────────────────────────────

function validatePriceData(item: ProviderPriceData): void {
  expect(item.productSlug).toBeTypeOf("string");
  expect(item.productSlug.length).toBeGreaterThan(0);
  expect(item.storeSlug).toBeTypeOf("string");
  expect(item.storeSlug.length).toBeGreaterThan(0);
  expect(item.price).toBeTypeOf("number");
  expect(item.price).toBeGreaterThan(0);
  expect(item.source).toBeTypeOf("string");
  expect(item.confidence).toBeTypeOf("number");
  expect(item.confidence).toBeGreaterThan(0);
  expect(item.confidence).toBeLessThanOrEqual(1);

  if (item.salePrice !== null && item.salePrice !== undefined) {
    expect(item.salePrice).toBeTypeOf("number");
    expect(item.salePrice).toBeGreaterThan(0);
    expect(item.salePrice).toBeLessThanOrEqual(item.price);
  }
}

function validateOpportunityData(item: ProviderOpportunityData): void {
  expect(item.type).toBeTypeOf("string");
  expect(item.type.length).toBeGreaterThan(0);
  expect(item.title).toBeTypeOf("string");
  expect(item.title.length).toBeGreaterThan(0);
  expect(item.valueType).toBeTypeOf("string");
  expect(item.valueAmount).toBeTypeOf("number");
  expect(item.valueAmount).toBeGreaterThan(0);

  if (item.valuePercent !== undefined) {
    expect(item.valuePercent).toBeGreaterThan(0);
    expect(item.valuePercent).toBeLessThanOrEqual(100);
  }

  if (item.minimumQuantity !== undefined) {
    expect(item.minimumQuantity).toBeGreaterThan(0);
  }

  if (item.confidence !== undefined) {
    expect(item.confidence).toBeGreaterThan(0);
    expect(item.confidence).toBeLessThanOrEqual(1);
  }
}

// ─── Contract Tests (run for each provider) ─────────────────────────────────

for (const provider of PROVIDERS) {
  describe(`Provider contract: ${provider.name} (${provider.id})`, () => {
    describe("metadata", () => {
      it("has a non-empty id", () => {
        expect(provider.id).toBeTypeOf("string");
        expect(provider.id.length).toBeGreaterThan(0);
      });

      it("has a non-empty name", () => {
        expect(provider.name).toBeTypeOf("string");
        expect(provider.name.length).toBeGreaterThan(0);
      });

      it("has a valid type", () => {
        const validTypes = ["RETAILER", "COUPON_NETWORK", "REBATE_APP", "CASHBACK_APP", "WEEKLY_AD", "RECEIPT_PROCESSOR", "COMMUNITY"];
        expect(validTypes).toContain(provider.type);
      });

      it("has a valid capabilities object", () => {
        expect(provider.capabilities).toBeTypeOf("object");
        expect(typeof provider.capabilities.prices).toBe("boolean");
        expect(typeof provider.capabilities.opportunities).toBe("boolean");
        expect(typeof provider.capabilities.weeklyAds).toBe("boolean");
        expect(typeof provider.capabilities.inventory).toBe("boolean");
        expect(typeof provider.capabilities.cartIntegration).toBe("boolean");
        expect(typeof provider.capabilities.receiptValidation).toBe("boolean");
      });

      it("has isDemo set to a boolean", () => {
        expect(typeof provider.isDemo).toBe("boolean");
      });
    });

    describe("getHealth()", () => {
      it("returns a valid ProviderHealth object", () => {
        const health = provider.getHealth();
        expect(health.providerId).toBe(provider.id);
        expect(health.providerName).toBe(provider.name);
        expect(health.type).toBe(provider.type);
        expect(["ACTIVE", "DEMO", "PENDING", "OFFLINE", "ERROR"]).toContain(health.status);
        expect(typeof health.isDemo).toBe("boolean");
      });
    });

    describe("fetchPrices()", () => {
      it("returns a ProviderFetchResult object", async () => {
        const result = await provider.fetchPrices(MOCK_PRODUCTS, MOCK_STORES);
        expect(result).toBeDefined();
        expect(result.providerId).toBe(provider.id);
        expect(typeof result.success).toBe("boolean");
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.fetchedAt).toBeInstanceOf(Date);
        expect(typeof result.count).toBe("number");
      });

      it("returns count matching data.length", async () => {
        const result = await provider.fetchPrices(MOCK_PRODUCTS, MOCK_STORES);
        expect(result.count).toBe(result.data.length);
      });

      it("returns valid price shapes when successful", async () => {
        const result = await provider.fetchPrices(MOCK_PRODUCTS, MOCK_STORES);
        if (result.success && result.data.length > 0) {
          for (const item of result.data) {
            validatePriceData(item);
          }
        }
      });

      it("handles empty product list gracefully", async () => {
        const result = await provider.fetchPrices([], MOCK_STORES);
        expect(result).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
      });

      it("handles empty store list gracefully", async () => {
        const result = await provider.fetchPrices(MOCK_PRODUCTS, []);
        expect(result).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
      });
    });

    describe("fetchOpportunities()", () => {
      it("returns a ProviderFetchResult object", async () => {
        const result = await provider.fetchOpportunities(MOCK_PRODUCTS, MOCK_STORES);
        expect(result).toBeDefined();
        expect(result.providerId).toBe(provider.id);
        expect(typeof result.success).toBe("boolean");
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.fetchedAt).toBeInstanceOf(Date);
      });

      it("returns count matching data.length", async () => {
        const result = await provider.fetchOpportunities(MOCK_PRODUCTS, MOCK_STORES);
        expect(result.count).toBe(result.data.length);
      });

      it("returns valid opportunity shapes when successful", async () => {
        const result = await provider.fetchOpportunities(MOCK_PRODUCTS, MOCK_STORES);
        if (result.success && result.data.length > 0) {
          for (const item of result.data) {
            validateOpportunityData(item);
          }
        }
      });

      it("handles call with no arguments", async () => {
        const result = await provider.fetchOpportunities();
        expect(result).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
      });
    });
  });
}
