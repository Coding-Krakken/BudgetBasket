import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { parseShoppingList } from "@/engine/parser";
import { createOptimizationResult, generateScenarios, getEligibilityTrace } from "@/engine/optimizer";
import { logger } from "@/lib/logger";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import type { OptimizationMode, OptimizeRequest } from "@/types";
import { z } from "zod";

const OptimizeSchema = z.object({
  shoppingList: z.string().min(1).max(5000),
  storeIds: z.array(z.string()).optional(),
  mode: z
    .enum(["CHEAPEST", "ONE_STORE", "FASTEST", "BEST_VERIFIED", "STOCK_UP"])
    .default("CHEAPEST"),
  maxStores: z.number().min(1).max(10).optional(),
  debug: z.boolean().optional(),
  preferences: z
    .object({
      allowSubstitutions: z.boolean().optional(),
      hassleCostPerStore: z.number().min(0).max(50).optional(),
      requiresLoyaltyCards: z.array(z.string()).optional(),
      avoidStoreIds: z.array(z.string()).optional(),
    })
    .optional(),
});

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`optimize:${ip}`, 20, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    logger.warn("Rate limit exceeded", { route: "optimize", ip });
    return NextResponse.json(
      { success: false, error: "Too many requests — please wait a moment and try again." },
      { status: 429, headers: rlHeaders }
    );
  }

  let body: OptimizeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400, headers: rlHeaders }
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
      { status: 422, headers: rlHeaders }
    );
  }

  const { shoppingList, storeIds, mode, preferences, debug } = parsed.data;
  const debugMode = debug === true && process.env.NODE_ENV !== "production";
  const t0 = Date.now();

  try {
    const parsedItems = parseShoppingList(shoppingList);
    if (parsedItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "Could not parse any items from shopping list. Please enter items separated by commas or new lines." },
        { status: 422, headers: rlHeaders }
      );
    }

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

    if (stores.length === 0) {
      return NextResponse.json(
        { success: false, error: "No active stores found. Please check your store configuration." },
        { status: 503, headers: rlHeaders }
      );
    }

    const optimizeInput = {
      parsedItems,
      products: products as never,
      stores: stores as never,
      opportunities: opportunities as never,
      priceObservations,
      mode: mode as OptimizationMode,
      preferences,
    };

    const scenarios = await generateScenarios(optimizeInput);

    const result = createOptimizationResult(
      shoppingList,
      parsedItems,
      scenarios,
      mode as OptimizationMode
    );

    const durationMs = Date.now() - t0;
    const primary = result.primaryScenario;
    const matchedCount = primary.items.filter((i) => i.product).length;

    logger.info("optimization_completed", {
      mode,
      itemCount: parsedItems.length,
      matchedCount,
      storeCount: primary.storeCount,
      totalSavings: primary.totalSavings.toFixed(2),
      confidence: primary.overallConfidence.toFixed(2),
      durationMs,
    });

    // Persist plan to database (best-effort; never fails the response)
    let planId: string | undefined;
    try {
      const plan = await db.cartPlan.create({
        data: {
          rawInput: shoppingList,
          optimizationMode: mode as never,
          originalTotalCost: primary.totalBasePrice,
          optimizedTotalCost: primary.totalEffectivePrice,
          totalSavings: primary.totalSavings,
          savingsPercent: primary.savingsPercent,
          overallConfidence: primary.overallConfidence,
          storeCount: primary.storeCount,
          itemCount: primary.items.length,
          appliedCouponCount: primary.items.reduce(
            (n, i) => n + i.appliedOpportunities.filter(o => !o.isFutureValue).length, 0
          ),
          appliedRebateCount: primary.items.reduce(
            (n, i) => n + i.appliedOpportunities.filter(o => o.isFutureValue).length, 0
          ),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          items: {
            create: primary.items.map(item => ({
              rawInput: item.raw,
              normalizedName: item.normalized,
              productId: item.product?.id ?? null,
              storeId: item.storeId ?? null,
              quantity: item.quantity,
              basePrice: item.basePrice,
              effectivePrice: item.effectivePrice,
              totalBasePrice: item.totalBasePrice,
              totalEffectivePrice: item.totalEffectivePrice,
              totalSavings: item.totalSavings,
              confidence: item.confidence,
              actionsRequired: item.actionsRequired,
              warnings: item.warnings,
            })),
          },
        },
      });
      planId = plan.id;
    } catch (planErr) {
      logger.warn("cart_plan_persist_failed", {
        error: planErr instanceof Error ? planErr.message : String(planErr),
      });
    }

    const responseBody: Record<string, unknown> = { success: true, data: result, planId };

    if (debugMode) {
      responseBody.debug = {
        eligibilityTrace: getEligibilityTrace(
          parsedItems,
          products as never,
          opportunities as never
        ),
        queriedStores: stores.length,
        queriedProducts: products.length,
        queriedOpportunities: opportunities.length,
        durationMs,
      };
    }

    return NextResponse.json(responseBody, { headers: rlHeaders });
  } catch (error) {
    const durationMs = Date.now() - t0;
    logger.error("optimization_failed", {
      error: error instanceof Error ? error.message : String(error),
      mode,
      durationMs,
    });
    return NextResponse.json(
      { success: false, error: "Optimization failed. Please try again." },
      { status: 500, headers: rlHeaders }
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
