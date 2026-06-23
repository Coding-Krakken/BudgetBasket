import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import db from "@/lib/db";
import { seedOptimizationFixture } from "@/test/integration/fixtures";
import { POST } from "./route";

describe("POST /api/optimize integration", () => {
  it("optimizes against real PostgreSQL data and persists the plan", async () => {
    await seedOptimizationFixture();

    const request = new NextRequest("http://localhost/api/optimize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "integration-optimize",
      },
      body: JSON.stringify({
        shoppingList: "milk\neggs\nchicken breast\ncheerios",
        mode: "CHEAPEST",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.planId).toEqual(expect.any(String));
    expect(body.data.primaryScenario.items).toHaveLength(4);
    expect(body.data.primaryScenario.items.every((item: { product?: unknown }) => item.product)).toBe(true);
    expect(body.data.scenarios).toHaveLength(5);

    const persisted = await db.cartPlan.findUnique({
      where: { id: body.planId },
      include: { items: true },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.items).toHaveLength(4);
    expect(persisted?.totalSavings).toBeGreaterThanOrEqual(0);
  });
});
