import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { parseShoppingList } from "@/engine/parser";
import { createOptimizationResult, generateScenarios } from "@/engine/optimizer";
import type { OptimizationMode, OptimizeRequest } from "@/types";
import { z } from "zod";

const OptimizeSchema = z.object({
  shoppingList: z.string().min(1).max(5000),
  storeIds: z.array(z.string()).optional(),
  mode: z
    .enum(["CHEAPEST", "ONE_STORE", "FASTEST", "BEST_VERIFIED", "STOCK_UP"])
    .default("CHEAPEST"),
  maxStores: z.number().min(1).max(10).optional(),
  preferences: z
    .object({
      allowSubstitutions: z.boolean().optional(),
      hassleCostPerStore: z.number().min(0).max(50).optional(),
      requiresLoyaltyCards: z.array(z.string()).optional(),
      avoidStoreIds: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  let body: OptimizeRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = OptimizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        details: parsed.error.flatten(),
      },
      { status: 422 }
    );
  }

  const { shoppingList, storeIds, mode, preferences } = parsed.data;

  try {
    // Parse the shopping list
    const parsedItems = parseShoppingList(shoppingList);
    if (parsedItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "Could not parse any items from shopping list" },
        { status: 422 }
      );
    }

    // Fetch relevant data from DB
    const [stores, products, opportunities, priceObservations] = await Promise.all([
      db.store.findMany({
        where: {
          isActive: true,
          ...(storeIds && storeIds.length > 0 ? { id: { in: storeIds } } : {}),
        },
      }),
      db.product.findMany({
        include: {
          brand: { select: { id: true, slug: true, name: true } },
          category: { select: { id: true, slug: true, name: true } },
        },
      }),
      db.opportunity.findMany({
        where: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        include: {
          store: { select: { id: true, slug: true, name: true, chain: true } },
          product: { select: { id: true, slug: true, name: true } },
        },
      }),
      db.priceObservation.findMany({
        where: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        select: {
          productId: true,
          storeId: true,
          price: true,
          salePrice: true,
          confidence: true,
        },
      }),
    ]);

    // Generate all scenarios
    const scenarios = await generateScenarios({
      parsedItems,
      products: products as never,
      stores: stores as never,
      opportunities: opportunities as never,
      priceObservations,
      mode: mode as OptimizationMode,
      preferences,
    });

    const result = createOptimizationResult(
      shoppingList,
      parsedItems,
      scenarios,
      mode as OptimizationMode
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Optimization error:", error);
    return NextResponse.json(
      { success: false, error: "Optimization failed. Please try again." },
      { status: 500 }
    );
  }
}

// GET for quick demo
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const list = searchParams.get("list") ?? "milk, eggs, chicken breast, Cheerios, bananas, toothpaste, laundry detergent";
  const mode = (searchParams.get("mode") as OptimizationMode) ?? "CHEAPEST";

  return POST(
    new NextRequest(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoppingList: list, mode }),
    })
  );
}
