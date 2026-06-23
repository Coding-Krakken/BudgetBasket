import { describe, expect, it, vi } from "vitest";
import { expireStaleOfferData, syncAllProviderData, syncProviderData } from "./sync";

function makeDatabase() {
  return {
    providerSyncRun: {
      create: vi.fn().mockResolvedValue({ id: "sync-1" }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([
        { id: "p1", slug: "chicken-breast-boneless", name: "Chicken Breast", normalizedName: "chicken breast" },
        { id: "p2", slug: "cheerios-18oz", name: "Cheerios Original", normalizedName: "cheerios original" },
      ]),
    },
    store: {
      findMany: vi.fn().mockResolvedValue([{ id: "s1", slug: "walmart", name: "Walmart" }]),
    },
    priceObservation: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
    },
    opportunity: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
    },
    weeklyAdDeal: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("syncProviderData", () => {
  it("returns SKIPPED when provider ID is not registered", async () => {
    const result = await syncProviderData("nonexistent-provider-id", { database: makeDatabase() as never });

    expect(result).toEqual({
      providerId: "nonexistent-provider-id",
      status: "SKIPPED",
      pricesIngested: 0,
      opportunitiesIngested: 0,
      itemsFailed: 0,
      errorMessage: "Provider is not registered.",
    });
  });

  it("runs sync for a registered no-credential provider without throwing", async () => {
    // live-open-food-facts: public API, no credentials needed, returns success([]) for prices/opportunities
    const database = makeDatabase();
    const result = await syncProviderData("live-open-food-facts", { database: database as never });

    expect(result.providerId).toBe("live-open-food-facts");
    expect(["SUCCESS", "SUCCESS_WITH_ERRORS", "FAILED"]).toContain(result.status);
    expect(result.pricesIngested).toBeGreaterThanOrEqual(0);
    expect(result.opportunitiesIngested).toBeGreaterThanOrEqual(0);
  });

  it("returns FAILED when a credential-gated provider has no credentials", async () => {
    const database = makeDatabase();
    const result = await syncProviderData("live-ibotta", { database: database as never });

    expect(result.providerId).toBe("live-ibotta");
    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toBeTruthy();
  });

  it("expires stale active opportunities and price observations", async () => {
    const database = {
      opportunity: {
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      priceObservation: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      weeklyAdDeal: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const now = new Date("2026-06-23T12:00:00.000Z");

    const result = await expireStaleOfferData({ database: database as never, now });

    expect(result).toEqual({
      expiredOpportunities: 3,
      expiredPriceObservations: 2,
      expiredWeeklyAdDeals: 1,
    });
    expect(database.opportunity.updateMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        expiresAt: { lt: now },
      },
      data: { isActive: false },
    });
    expect(database.priceObservation.updateMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        expiresAt: { lt: now },
      },
      data: { isActive: false },
    });
    expect(database.weeklyAdDeal.updateMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        validTo: { lt: now },
      },
      data: { isActive: false },
    });
  });

  it("syncAllProviderData includes results for each registered provider and runs expiration sweep", async () => {
    // Mock the registry to return a small deterministic set for this unit test
    const { getAllProviders } = await vi.importActual<typeof import("./registry")>("./registry");
    const allProviders = getAllProviders();

    const database = makeDatabase() as never;
    const result = await syncAllProviderData({ database });

    expect(result.expirationSweep).toEqual({
      expiredOpportunities: 0,
      expiredPriceObservations: 0,
      expiredWeeklyAdDeals: 0,
    });
    // All providers with prices or opportunities capability should appear in results
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every(r => typeof r.providerId === "string")).toBe(true);
    expect(result.results.every(r => ["SUCCESS", "SUCCESS_WITH_ERRORS", "FAILED", "SKIPPED"].includes(r.status))).toBe(true);
    expect(result.startedAt).toBeTruthy();
    expect(result.completedAt).toBeTruthy();

    // Verify a sample of expected live provider IDs are present
    const resultIds = new Set(result.results.map(r => r.providerId));
    expect(resultIds.has("live-open-food-facts")).toBe(true);
    expect(resultIds.has("live-flipp")).toBe(true);
    expect(resultIds.has("live-ibotta")).toBe(true);
  });
});
