import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getCurrentUserId } from "@/lib/provider-oauth";

export async function GET(request: NextRequest) {
  const userId = getCurrentUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 });
  }

  const connections = await db.providerConnection.findMany({
    where: { userId },
    select: {
      providerId: true,
      providerName: true,
      status: true,
      accountEmail: true,
      accountId: true,
      lastSyncedAt: true,
      syncError: true,
      tokenExpiresAt: true,
      updatedAt: true,
    },
    orderBy: { providerName: "asc" },
  });

  return NextResponse.json({ success: true, data: connections });
}
