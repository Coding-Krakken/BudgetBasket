// Preferences API — for anonymous users, preferences are stored client-side.
// This endpoint validates and echoes back the preference payload so the client
// can confirm the shape is correct, and acts as a save point for future
// authenticated users where we'd persist to UserPreferences in the database.

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

const PreferencesSchema = z.object({
  defaultOptimizationMode: z
    .enum(["CHEAPEST", "ONE_STORE", "FASTEST", "BEST_VERIFIED", "STOCK_UP"])
    .default("CHEAPEST"),
  hassleCostPerStore: z.number().min(0).max(50).default(5),
  maxStores: z.number().min(1).max(10).default(2),
  allowSubstitutions: z.boolean().default(true),
  preferOrganic: z.boolean().default(false),
  preferNameBrand: z.boolean().default(false),
  zipCode: z.string().max(10).optional(),
  radiusMiles: z.number().min(5).max(200).default(25),
});

export type UserPreferencesPayload = z.infer<typeof PreferencesSchema>;

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`prefs:${ip}`, 60, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  // Return defaults — client merges with its own localStorage copy
  const defaults = PreferencesSchema.parse({});
  return NextResponse.json({ success: true, data: defaults }, { headers: rlHeaders });
}

export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`prefs:${ip}`, 30, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400, headers: rlHeaders }
    );
  }

  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid preferences", details: parsed.error.flatten() },
      { status: 422, headers: rlHeaders }
    );
  }

  // For anonymous users the client stores this in localStorage.
  // In a future authenticated version we'd persist to UserPreferences here.
  return NextResponse.json(
    { success: true, data: parsed.data },
    { headers: rlHeaders }
  );
}
