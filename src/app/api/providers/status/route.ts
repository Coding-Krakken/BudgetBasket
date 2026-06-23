import { NextResponse } from "next/server";
import { getProviderHealthSummary } from "@/providers/registry";
import db from "@/lib/db";

export async function GET() {
  try {
    const providerHealth = getProviderHealthSummary();

    // Enrich with recent sync run data
    const syncRuns = await db.providerSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    const syncByProvider = new Map<string, typeof syncRuns[0]>();
    for (const run of syncRuns) {
      if (!syncByProvider.has(run.providerId)) {
        syncByProvider.set(run.providerId, run);
      }
    }

    const enriched = providerHealth.map(p => {
      const lastRun = syncByProvider.get(p.providerId);
      return {
        ...p,
        lastSyncAt: lastRun?.completedAt ?? p.lastSyncAt,
        lastSyncStatus: lastRun?.status ?? null,
        lastSyncItemsIngested: lastRun?.itemsIngested ?? 0,
        lastSyncError: lastRun?.errorMessage ?? null,
      };
    });

    const summary = {
      total: enriched.length,
      active: enriched.filter(p => p.status === "ACTIVE").length,
      demo: enriched.filter(p => p.status === "DEMO").length,
      pending: enriched.filter(p => p.status === "PENDING").length,
      offline: enriched.filter(p => p.status === "OFFLINE").length,
    };

    return NextResponse.json({
      success: true,
      data: {
        providers: enriched,
        summary,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Providers status error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch provider status" },
      { status: 500 }
    );
  }
}
