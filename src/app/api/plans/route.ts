import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

const ListSchema = z.object({
  ids: z.string().min(1).max(2000),
});

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`plans:${ip}`, 30, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json(
      { success: false, error: "Missing ids parameter" },
      { status: 400, headers: rlHeaders }
    );
  }

  const validation = ListSchema.safeParse({ ids: idsParam });
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 422, headers: rlHeaders }
    );
  }

  const ids = idsParam.split(",").map(id => id.trim()).filter(Boolean).slice(0, 20);

  try {
    const plans = await db.cartPlan.findMany({
      where: {
        id: { in: ids },
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        rawInput: true,
        optimizationMode: true,
        originalTotalCost: true,
        optimizedTotalCost: true,
        totalSavings: true,
        savingsPercent: true,
        overallConfidence: true,
        storeCount: true,
        itemCount: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { success: true, data: plans },
      { headers: rlHeaders }
    );
  } catch (error) {
    console.error("Plans list error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch plans" },
      { status: 500, headers: rlHeaders }
    );
  }
}
