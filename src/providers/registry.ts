import type { ProviderHealth } from "@/types";
import { BaseProvider } from "./base";
import { SeedWalmartProvider } from "./seed-walmart";

// Registry of all active providers
const providerRegistry: Record<string, BaseProvider> = {};

function registerProvider(provider: BaseProvider) {
  providerRegistry[provider.id] = provider;
}

// Register all seed/demo providers
registerProvider(new SeedWalmartProvider());

// Future: registerProvider(new RealKrogerProvider());
// Future: registerProvider(new RealTargetProvider());
// Future: registerProvider(new RealIbottaProvider());

export function getProvider(id: string): BaseProvider | undefined {
  return providerRegistry[id];
}

export function getAllProviders(): BaseProvider[] {
  return Object.values(providerRegistry);
}

export function getProviderHealthSummary(): ProviderHealth[] {
  // In MVP, return static health info for all known providers (including non-instantiated ones)
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
    },
    // Future providers (not yet integrated)
    {
      providerId: "live-kroger-api",
      providerName: "Kroger API (Official)",
      type: "RETAILER",
      status: "PENDING",
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
