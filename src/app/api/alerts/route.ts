import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

const CreateAlertSchema = z.object({
  userId: z.string().min(1).max(200),
  productId: z.string().cuid(),
  alertType: z.enum(["BELOW_PRICE", "ON_SALE", "HISTORIC_LOW"]).default("BELOW_PRICE"),
  targetPrice: z.number().positive().nullable().optional(),
});

const DeleteAlertSchema = z.object({
  userId: z.string().min(1).max(200),
  productId: z.string().cuid(),
  alertType: z.enum(["BELOW_PRICE", "ON_SALE", "HISTORIC_LOW"]).optional(),
});

// GET /api/alerts?userId=xxx
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`alerts:get:${ip}`, 60, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429, headers: rlHeaders });
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ success: false, error: "userId required" }, { status: 400, headers: rlHeaders });
  }

  try {
    const alerts = await db.priceAlert.findMany({
      where: { userId, isActive: true },
      include: {
        product: {
          select: {
            id: true, slug: true, name: true, imageUrl: true,
            averagePrice: true, historicalLow: true,
            category: { select: { name: true, slug: true } },
            brand: { select: { name: true } },
            priceObservations: {
              where: { isActive: true },
              orderBy: { confidence: "desc" },
              take: 1,
              select: { price: true, salePrice: true, store: { select: { name: true, slug: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: alerts }, { headers: rlHeaders });
  } catch (error) {
    console.error("Alerts GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch alerts" }, { status: 500, headers: rlHeaders });
  }
}

// POST /api/alerts — add to watchlist
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`alerts:post:${ip}`, 30, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429, headers: rlHeaders });
  }

  try {
    const body = await request.json();
    const parsed = CreateAlertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid request" }, { status: 422, headers: rlHeaders });
    }

    const { userId, productId, alertType, targetPrice } = parsed.data;

    const existing = await db.priceAlert.findUnique({
      where: { userId_productId_alertType: { userId, productId, alertType } },
    });

    if (existing) {
      const updated = await db.priceAlert.update({
        where: { id: existing.id },
        data: { isActive: true, targetPrice: targetPrice ?? null, updatedAt: new Date() },
      });
      return NextResponse.json({ success: true, data: updated }, { headers: rlHeaders });
    }

    const alert = await db.priceAlert.create({
      data: { userId, productId, alertType, targetPrice: targetPrice ?? null },
    });

    return NextResponse.json({ success: true, data: alert }, { status: 201, headers: rlHeaders });
  } catch (error) {
    console.error("Alerts POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to create alert" }, { status: 500, headers: rlHeaders });
  }
}

// DELETE /api/alerts — remove from watchlist
export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`alerts:delete:${ip}`, 30, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429, headers: rlHeaders });
  }

  try {
    const body = await request.json();
    const parsed = DeleteAlertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid request" }, { status: 422, headers: rlHeaders });
    }

    const { userId, productId, alertType } = parsed.data;

    await db.priceAlert.updateMany({
      where: {
        userId,
        productId,
        ...(alertType ? { alertType } : {}),
      },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true }, { headers: rlHeaders });
  } catch (error) {
    console.error("Alerts DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to remove alert" }, { status: 500, headers: rlHeaders });
  }
}
