import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(`plan:${ip}`, 30, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  const { id } = await params;
  if (!id || id.length > 50) {
    return NextResponse.json(
      { success: false, error: "Invalid plan ID" },
      { status: 400, headers: rlHeaders }
    );
  }

  try {
    const plan = await db.cartPlan.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                averagePrice: true,
                category: { select: { id: true, name: true, slug: true } },
                brand: { select: { id: true, name: true, slug: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Plan not found" },
        { status: 404, headers: rlHeaders }
      );
    }

    if (plan.expiresAt && plan.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: "Plan has expired" },
        { status: 410, headers: rlHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: plan },
      { headers: rlHeaders }
    );
  } catch (error) {
    console.error("Plan fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch plan" },
      { status: 500, headers: rlHeaders }
    );
  }
}
