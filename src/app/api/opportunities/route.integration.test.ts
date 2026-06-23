import { ConfidenceLevel, OpportunityType, StackabilityRule } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { seedOptimizationFixture } from "@/test/integration/fixtures";
import db from "@/lib/db";
import { GET } from "./route";

describe("GET /api/opportunities integration", () => {
  it("returns real opportunity rows and excludes expired opportunities by default", async () => {
    const { stores, products } = await seedOptimizationFixture();
    await db.opportunity.create({
      data: {
        type: OpportunityType.STORE_SALE,
        title: "Expired milk sale",
        storeId: stores.walmart.id,
        productId: products.milk.id,
        providerId: "fixture",
        valueType: "FIXED_OFF",
        valueAmount: 0.5,
        stackability: StackabilityRule.STANDALONE,
        confidenceLevel: ConfidenceLevel.SEED_DEMO,
        confidence: 0.75,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });

    const request = new NextRequest("http://localhost/api/opportunities?storeSlug=walmart&limit=10");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe("$1 off Cheerios");
    expect(body.data.map((opportunity: { title: string }) => opportunity.title)).not.toContain("Expired milk sale");
  });
});
