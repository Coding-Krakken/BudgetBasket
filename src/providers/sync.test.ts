import { describe, expect, it, vi } from "vitest";
import { expireStaleOfferData, syncAllProviderData, syncProviderData } from "./sync";

describe("syncProviderData", () => {
  it("persists provider prices and opportunities and completes the sync run", async () => {
    const database = {
      providerSyncRun: {
        create: vi.fn().mockResolvedValue({ id: "sync-1" }),
        update: vi.fn().mockResolvedValue({}),
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

    const result = await syncProviderData("seed-walmart", { database: database as never });

    expect(result).toEqual({
      providerId: "seed-walmart",
      status: "SUCCESS",
      pricesIngested: 2,
      opportunitiesIngested: 2,
      itemsFailed: 0,
    });
    expect(database.priceObservation.updateMany).toHaveBeenCalledWith({
      where: { source: "seed-walmart", isActive: true },
      data: { isActive: false },
    });
    expect(database.opportunity.updateMany).toHaveBeenCalledWith({
      where: { providerId: "seed-walmart", isActive: true },
      data: { isActive: false },
    });
    expect(database.priceObservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "p1",
        storeId: "s1",
        price: 3.98,
        salePrice: 3.48,
        source: "seed-walmart",
      }),
    });
    expect(database.opportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "STORE_SALE",
        productId: "p1",
        storeId: "s1",
        providerId: "seed-walmart",
      }),
    });
    expect(database.providerSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync-1" },
      data: expect.objectContaining({
        status: "SUCCESS",
        itemsIngested: 4,
        itemsUpdated: 4,
        itemsFailed: 0,
      }),
    });
  });

  it("returns SUCCESS_WITH_ERRORS when provider items cannot be mapped", async () => {
    const database = {
      providerSyncRun: {
        create: vi.fn().mockResolvedValue({ id: "sync-1" }),
        update: vi.fn().mockResolvedValue({}),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p1", slug: "chicken-breast-boneless", name: "Chicken Breast", normalizedName: "chicken breast" },
          { id: "p2", slug: "cheerios-18oz", name: "Cheerios Original", normalizedName: "cheerios original" },
        ]),
      },
      store: {
        findMany: vi.fn().mockResolvedValue([]),
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

    const result = await syncProviderData("seed-walmart", { database: database as never });

    expect(result).toEqual({
      providerId: "seed-walmart",
      status: "SUCCESS_WITH_ERRORS",
      pricesIngested: 0,
      opportunitiesIngested: 0,
      itemsFailed: 4,
    });
    expect(database.providerSyncRun.update).toHaveBeenCalledWith({
      where: { id: "sync-1" },
      data: expect.objectContaining({
        status: "SUCCESS_WITH_ERRORS",
        itemsIngested: 0,
        itemsUpdated: 0,
        itemsFailed: 4,
      }),
    });
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

  it("syncs all registered offer providers after the expiration sweep", async () => {
    const database = {
      providerSyncRun: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `sync-${data.providerId}` })),
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p1", slug: "chicken-breast-boneless", name: "Chicken Breast", normalizedName: "chicken breast" },
          { id: "p2", slug: "cheerios-18oz", name: "Cheerios Original", normalizedName: "cheerios original" },
          { id: "p3", slug: "tide-pods-32ct", name: "Tide Pods", normalizedName: "tide pods" },
          { id: "p4", slug: "eggs-large-dozen", name: "Large Eggs", normalizedName: "large eggs" },
          { id: "p5", slug: "paper-towels-bounty-8pk", name: "Bounty Paper Towels", normalizedName: "paper towels" },
        ]),
      },
      store: {
        findMany: vi.fn().mockResolvedValue([
          { id: "s1", slug: "walmart", name: "Walmart" },
          { id: "s2", slug: "target", name: "Target" },
          { id: "s3", slug: "aldi", name: "Aldi" },
        ]),
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

    const result = await syncAllProviderData({ database: database as never });

    expect(result.results.map(item => item.providerId)).toEqual([
      "seed-walmart",
      "seed-flipp",
      "seed-ibotta",
      "seed-fetch",
    ]);
    expect(result.expirationSweep).toEqual({
      expiredOpportunities: 0,
      expiredPriceObservations: 0,
      expiredWeeklyAdDeals: 0,
    });
    expect(database.providerSyncRun.create).toHaveBeenCalledTimes(4);
    expect(database.weeklyAdDeal.create).toHaveBeenCalled();
  });
});
