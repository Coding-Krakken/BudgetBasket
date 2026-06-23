import { NextRequest, NextResponse } from "next/server";
import { syncAllProviderData } from "@/providers/sync";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getCronSecret() {
  return process.env.CRON_SECRET ?? process.env.PROVIDER_SYNC_SECRET;
}

function isAuthorized(request: NextRequest) {
  const secret = getCronSecret();
  if (!secret) return process.env.NODE_ENV !== "production";

  const auth = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron");
  return auth === `Bearer ${secret}` || cronHeader === "1";
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await syncAllProviderData();
    const hasFailures = data.results.some(result => result.status === "FAILED");
    return NextResponse.json(
      {
        success: !hasFailures,
        data,
      },
      { status: hasFailures ? 207 : 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("cron_sync_providers_failed", { error: message });
    return NextResponse.json({ success: false, error: "Provider sync failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
