import { describe, expect, it, vi } from "vitest";
import { syncProviderData } from "./sync";

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
});
