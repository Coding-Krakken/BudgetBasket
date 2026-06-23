import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import db from "@/lib/db";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function generateShareToken(): string {
  return randomBytes(16).toString("base64url");
}

// POST /api/plans/[id]/share — generate or return existing share token
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(`share:${ip}`, 20, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  const { id } = await params;

  try {
    const plan = await db.cartPlan.findUnique({
      where: { id },
      select: { id: true, shareToken: true, shareExpiresAt: true, expiresAt: true },
    });

    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Plan not found" },
        { status: 404, headers: rlHeaders }
      );
    }

    const now = new Date();
    const tokenIsValid =
      plan.shareToken &&
      (!plan.shareExpiresAt || plan.shareExpiresAt > now);

    if (tokenIsValid) {
      return NextResponse.json(
        { success: true, data: { shareToken: plan.shareToken, shareExpiresAt: plan.shareExpiresAt } },
        { headers: rlHeaders }
      );
    }

    const shareToken = generateShareToken();
    const shareExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const updated = await db.cartPlan.update({
      where: { id },
      data: { shareToken, shareExpiresAt },
      select: { shareToken: true, shareExpiresAt: true },
    });

    return NextResponse.json(
      { success: true, data: updated },
      { status: 201, headers: rlHeaders }
    );
  } catch (error) {
    console.error("Share token error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate share link" },
      { status: 500, headers: rlHeaders }
    );
  }
}
