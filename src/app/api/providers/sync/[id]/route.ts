import { NextRequest, NextResponse } from "next/server";
import { syncProviderData } from "@/providers/sync";
import type { ProviderSyncResult } from "@/providers/sync";

function getSyncResponseStatus(status: ProviderSyncResult["status"]) {
  if (status === "FAILED") return 500;
  if (status === "SUCCESS_WITH_ERRORS") return 207;
  return 200;
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (process.env.NODE_ENV === "production" && !process.env.PROVIDER_SYNC_SECRET) {
    return NextResponse.json(
      { success: false, error: "Provider sync secret is not configured" },
      { status: 503 }
    );
  }

  if (process.env.NODE_ENV === "production") {
    const auth = _request.headers.get("authorization");
    if (auth !== `Bearer ${process.env.PROVIDER_SYNC_SECRET}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await syncProviderData(id);

  return NextResponse.json(
    {
      success: result.status === "SUCCESS",
      data: result,
    },
    { status: getSyncResponseStatus(result.status) }
  );
}
