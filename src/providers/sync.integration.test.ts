import { describe, expect, it } from "vitest";
import db from "@/lib/db";
import { syncProviderData } from "./sync";

describe("syncProviderData integration", () => {
  it("creates sync run records in PostgreSQL for a live public provider", async () => {
    const category = await db.category.create({
      data: { slug: "grocery", name: "Grocery" },
    });
    await Promise.all([
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

    // live-open-food-facts: public API, no credentials needed
    const result = await syncProviderData("live-open-food-facts");

    expect(result.providerId).toBe("live-open-food-facts");
    expect(["SUCCESS", "SUCCESS_WITH_ERRORS", "FAILED"]).toContain(result.status);

    await expect(
      db.providerSyncRun.findFirstOrThrow({
        where: { providerId: "live-open-food-facts" },
      })
    ).resolves.toMatchObject({
      providerId: "live-open-food-facts",
    });
  });

  it("returns FAILED and records error message when credential-gated provider has no credentials", async () => {
    const result = await syncProviderData("live-ibotta");

    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toBeTruthy();

    await expect(
      db.providerSyncRun.findFirstOrThrow({
        where: { providerId: "live-ibotta" },
        orderBy: { startedAt: "desc" },
      })
    ).resolves.toMatchObject({
      status: "FAILED",
    });
  });
});
