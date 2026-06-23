import type { ProviderHealth } from "@/types";
import { BaseProvider } from "./base";
import { credentialStore } from "./credential-store";
import { LiveKrogerProvider } from "./live-kroger";
import { ManualWeeklyAdProvider } from "./manual-weekly-ads";
import { SeedFetchRewardsProvider, SeedIbottaProvider } from "./seed-rebate-provider";
import { SeedWalmartProvider } from "./seed-walmart";
import db from "@/lib/db";

// Registry of all active providers
const providerRegistry: Record<string, BaseProvider> = {};

function registerProvider(provider: BaseProvider) {
  providerRegistry[provider.id] = provider;
}

// Register all seed/demo providers
registerProvider(new SeedWalmartProvider());
registerProvider(new ManualWeeklyAdProvider());
registerProvider(new SeedIbottaProvider());
registerProvider(new SeedFetchRewardsProvider());

const liveKrogerProvider = new LiveKrogerProvider(credentialStore);
if (liveKrogerProvider.hasRequiredCredentials()) {
  registerProvider(liveKrogerProvider);
}

// Future: registerProvider(new RealTargetProvider());
// Future: registerProvider(new RealIbottaProvider());

export function getProvider(id: string): BaseProvider | undefined {
  return providerRegistry[id];
}

export function getAllProviders(): BaseProvider[] {
  return Object.values(providerRegistry);
}

// Synchronous baseline — used when DB is unavailable
export function getProviderHealthSummary(): ProviderHealth[] {
  const knownProviders: ProviderHealth[] = [
    {
      providerId: "seed-walmart",
      providerName: "Walmart (Demo Data)",
      type: "RETAILER",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 15,
      capabilities: { prices: true, opportunities: true, weeklyAds: true, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
      syncCapable: true,
    },
    {
      providerId: "seed-target",
      providerName: "Target (Demo Data)",
      type: "RETAILER",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 10,
      capabilities: { prices: true, opportunities: true, weeklyAds: true, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
    },
    {
      providerId: "seed-kroger",
      providerName: "Kroger (Demo Data)",
      type: "RETAILER",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 14,
      capabilities: { prices: true, opportunities: true, weeklyAds: true, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
    },
    {
      providerId: "seed-aldi",
      providerName: "Aldi (Demo Data)",
      type: "RETAILER",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 8,
      capabilities: { prices: true, opportunities: false, weeklyAds: true, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
    },
    {
      providerId: "seed-wegmans",
      providerName: "Wegmans (Demo Data)",
      type: "RETAILER",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 6,
      capabilities: { prices: true, opportunities: true, weeklyAds: true, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
    },
    {
      providerId: "seed-cvs",
      providerName: "CVS Pharmacy (Demo Data)",
      type: "RETAILER",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 6,
      capabilities: { prices: true, opportunities: true, weeklyAds: true, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
    },
    {
      providerId: "seed-walgreens",
      providerName: "Walgreens (Demo Data)",
      type: "RETAILER",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 5,
      capabilities: { prices: true, opportunities: true, weeklyAds: true, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
    },
    {
      providerId: "seed-costco",
      providerName: "Costco (Demo Data)",
      type: "RETAILER",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 4,
      capabilities: { prices: true, opportunities: false, weeklyAds: false, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
    },
    {
      providerId: "seed-ibotta",
      providerName: "Ibotta (Demo Data)",
      type: "REBATE_APP",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 18,
      capabilities: { prices: false, opportunities: true, weeklyAds: false, inventory: false, cartIntegration: false, receiptValidation: true },
      isDemo: true,
      syncCapable: true,
    },
    {
      providerId: "seed-fetch",
      providerName: "Fetch Rewards (Demo Data)",
      type: "REBATE_APP",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 6,
      capabilities: { prices: false, opportunities: true, weeklyAds: false, inventory: false, cartIntegration: false, receiptValidation: true },
      isDemo: true,
      syncCapable: true,
    },
    {
      providerId: "seed-coupons",
      providerName: "Coupons.com (Demo Data)",
      type: "COUPON_NETWORK",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 12,
      capabilities: { prices: false, opportunities: true, weeklyAds: false, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
    },
    {
      providerId: "seed-flipp",
      providerName: "Flipp Weekly Ads (Demo Data)",
      type: "WEEKLY_AD",
      status: "DEMO",
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 8,
      capabilities: { prices: true, opportunities: true, weeklyAds: true, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: true,
      syncCapable: true,
    },
    // Future providers (not yet integrated)
    {
      providerId: "live-kroger-api",
      providerName: "Kroger API (Official)",
      type: "RETAILER",
      status: liveKrogerProvider.hasRequiredCredentials() ? "PENDING" : "OFFLINE",
      lastSyncAt: null,
      lastSuccessAt: null,
      freshnessMinutes: null,
      itemCount: 0,
      capabilities: { prices: true, opportunities: true, weeklyAds: true, inventory: true, cartIntegration: true, receiptValidation: false },
      isDemo: false,
    },
    {
      providerId: "live-walmart-api",
      providerName: "Walmart Affiliate API (Official)",
      type: "RETAILER",
      status: "PENDING",
      lastSyncAt: null,
      lastSuccessAt: null,
      freshnessMinutes: null,
      itemCount: 0,
      capabilities: { prices: true, opportunities: false, weeklyAds: false, inventory: false, cartIntegration: false, receiptValidation: false },
      isDemo: false,
    },
    {
      providerId: "live-ibotta-api",
      providerName: "Ibotta Publisher API",
      type: "REBATE_APP",
      status: "PENDING",
      lastSyncAt: null,
      lastSuccessAt: null,
      freshnessMinutes: null,
      itemCount: 0,
      capabilities: { prices: false, opportunities: true, weeklyAds: false, inventory: false, cartIntegration: false, receiptValidation: true },
      isDemo: false,
    },
  ];

  return knownProviders;
}

// Async version enriched with real DB counts from ProviderSyncRun records
export async function getProviderHealthSummaryFromDb(): Promise<ProviderHealth[]> {
  const base = getProviderHealthSummary();

  try {
    const [syncRuns, oppCounts] = await Promise.all([
      db.providerSyncRun.findMany({ orderBy: { startedAt: "desc" }, take: 100 }),
      db.opportunity.groupBy({ by: ["providerId"], _count: { id: true }, where: { isActive: true } }),
    ]);

    const latestByProvider = new Map<string, typeof syncRuns[0]>();
    for (const run of syncRuns) {
      if (!latestByProvider.has(run.providerId)) latestByProvider.set(run.providerId, run);
    }

    const countByProvider = new Map<string, number>();
    for (const row of oppCounts) {
      countByProvider.set(row.providerId, row._count.id);
    }

    return base.map(p => {
      const lastRun = latestByProvider.get(p.providerId);
      const dbCount = countByProvider.get(p.providerId);
      return {
        ...p,
        ...(lastRun ? { lastSyncAt: lastRun.completedAt ?? lastRun.startedAt } : {}),
        ...(dbCount !== undefined ? { itemCount: dbCount } : {}),
      };
    });
  } catch {
    // DB unavailable — return static baseline
    return base;
  }
}
