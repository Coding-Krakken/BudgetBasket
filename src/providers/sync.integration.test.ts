import { describe, expect, it } from "vitest";
import db from "@/lib/db";
import { syncProviderData } from "./sync";

describe("syncProviderData integration", () => {
  it("creates sync run, price observations, and opportunities in PostgreSQL", async () => {
    const store = await db.store.create({
      data: {
        slug: "walmart",
        name: "Walmart",
        chain: "Walmart",
      },
    });
    const category = await db.category.create({
      data: { slug: "grocery", name: "Grocery" },
    });
    const [chicken, cheerios] = await Promise.all([
      db.product.create({
        data: {
          slug: "chicken-breast-boneless",
          name: "Boneless Skinless Chicken Breast",
          normalizedName: "chicken breast boneless skinless",
          categoryId: category.id,
        },
      }),
      db.product.create({
        data: {
          slug: "cheerios-18oz",
          name: "Cheerios Original (18 oz)",
          normalizedName: "cheerios original",
          categoryId: category.id,
        },
      }),
    ]);

    const result = await syncProviderData("seed-walmart");

    expect(result).toEqual({
      providerId: "seed-walmart",
      status: "SUCCESS",
      pricesIngested: 2,
      opportunitiesIngested: 2,
      itemsFailed: 0,
    });

    await expect(db.providerSyncRun.findFirstOrThrow({
      where: { providerId: "seed-walmart" },
    })).resolves.toMatchObject({
      status: "SUCCESS",
      itemsIngested: 4,
      itemsUpdated: 4,
      itemsFailed: 0,
    });

    await expect(db.priceObservation.count({
      where: { source: "seed-walmart", storeId: store.id },
    })).resolves.toBe(2);
    await expect(db.opportunity.count({
      where: {
        providerId: "seed-walmart",
        productId: { in: [chicken.id, cheerios.id] },
      },
    })).resolves.toBe(2);
  });
});
