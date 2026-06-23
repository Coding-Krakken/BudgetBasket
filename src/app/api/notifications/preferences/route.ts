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

const PrefsSchema = z.object({
  userId: z.string().min(1),
  dealAlerts: z.boolean().optional(),
  expiryReminders: z.boolean().optional(),
  rebateReminders: z.boolean().optional(),
  priceDropAlerts: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  email: z.string().email().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`notif-prefs:${ip}`, 30, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429, headers: rlHeaders });
  }

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ success: false, error: "userId required" }, { status: 400, headers: rlHeaders });
  }

  const prefs = await db.notificationPreference.findUnique({ where: { userId } });
  return NextResponse.json({ success: true, data: prefs }, { headers: rlHeaders });
}

export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`notif-prefs:put:${ip}`, 20, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429, headers: rlHeaders });
  }

  try {
    const body = await request.json();
    const parsed = PrefsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid body" }, { status: 422, headers: rlHeaders });
    }

    const { userId, ...data } = parsed.data;
    const prefs = await db.notificationPreference.upsert({
      where: { userId },
      update: { ...data, updatedAt: new Date() },
      create: { userId, ...data },
    });

    return NextResponse.json({ success: true, data: prefs }, { headers: rlHeaders });
  } catch (error) {
    console.error("Notification prefs error:", error);
    return NextResponse.json({ success: false, error: "Failed to save preferences" }, { status: 500, headers: rlHeaders });
  }
}
