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

const MarkReadSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(50),
});

// GET /api/notifications?userId=xxx&limit=20&unreadOnly=true
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`notifications:get:${ip}`, 60, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "userId is required" },
      { status: 400, headers: rlHeaders }
    );
  }

  try {
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.notification.count({ where: { userId, isRead: false } }),
    ]);

    return NextResponse.json(
      { success: true, data: notifications, meta: { unreadCount } },
      { headers: rlHeaders }
    );
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications" },
      { status: 500, headers: rlHeaders }
    );
  }
}

// PATCH /api/notifications — mark as read
export async function PATCH(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`notifications:patch:${ip}`, 30, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  try {
    const body = await request.json();
    const parsed = MarkReadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 422, headers: rlHeaders }
      );
    }

    await db.notification.updateMany({
      where: { id: { in: parsed.data.ids } },
      data: { isRead: true },
    });

    return NextResponse.json(
      { success: true },
      { headers: rlHeaders }
    );
  } catch (error) {
    console.error("Notifications PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update notifications" },
      { status: 500, headers: rlHeaders }
    );
  }
}
