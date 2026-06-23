import type { ProviderHealth } from "@/types"
import { BaseProvider } from "./base"
import db from "@/lib/db"

// ── Public / open-data providers ─────────────────────────────────────────────
import { LiveOpenFoodFactsProvider } from "./live-open-food-facts"
import { LiveUsdaProvider } from "./live-usda"
import { LiveFlippProvider } from "./live-flipp"
import { LiveWalmartDealsProvider } from "./live-walmart-deals"
import { LiveTargetDealsProvider } from "./live-target-deals"
import { LiveCostcoProvider } from "./live-costco"
import { LiveAldiProvider } from "./live-aldi"
import { LiveDollarGeneralProvider } from "./live-dollar-general"
import { LiveSamsClubProvider } from "./live-sams-club"
import { LiveFlashfoodProvider } from "./live-flashfood"
import { LiveLozoProvider } from "./live-lozo"

// ── Deal blog / community RSS providers ──────────────────────────────────────
import { LiveSlickdealsProvider } from "./live-slickdeals"
import { LiveHip2SaveProvider } from "./live-hip2save"
import { LiveKclProvider } from "./live-kcl"
import { LiveSouthernSaversProvider } from "./live-southern-savers"
import { LiveRedditDealsProvider } from "./live-reddit-deals"

// ── Credential-gated: Retailer official APIs ─────────────────────────────────
import { LiveKrogerProvider } from "./live-kroger"
import { LiveWalgreensApiProvider } from "./live-walgreens-api"
import { LiveWalmartApiProvider } from "./live-walmart-api"
import { LiveTargetApiProvider } from "./live-target-api"
import { LiveInstacartProvider } from "./live-instacart"
import { LiveGoodRxProvider } from "./live-goodrx"

// ── Credential-gated: Rebate / cashback apps ─────────────────────────────────
import { LiveIbottaProvider } from "./live-ibotta"
import { LiveIbottaPerformanceProvider } from "./live-ibotta-performance"
import { LiveFetchRewardsProvider } from "./live-fetch-rewards"
import { LiveCheckout51Provider } from "./live-checkout51"
import { LiveShopmiumProvider } from "./live-shopmium"
import { LiveRakutenCashbackProvider } from "./live-rakuten-cashback"
import { LiveUpsideProvider } from "./live-upside"
import { LiveTooGoodToGoProvider } from "./live-too-good-to-go"

// ── Credential-gated: Coupon / affiliate networks ────────────────────────────
import { LiveCouponsDotComProvider } from "./live-coupons-com"
import { LiveRetailMeNotProvider } from "./live-retailmenot"
import { LiveCJAffiliateProvider } from "./live-cj-affiliate"
import { LiveRakutenAdvertisingProvider } from "./live-rakuten-advertising"
import { LiveImpactProvider } from "./live-impact"
import { LiveAwinProvider } from "./live-awin"
import { LiveShareASaleProvider } from "./live-shareasale"
import { LiveFlexOffersProvider } from "./live-flexoffers"

// ── Credential-gated: Manufacturer coupon portals ────────────────────────────
import { LivePGProvider } from "./live-pg"
import { LiveGeneralMillsProvider } from "./live-general-mills"
import { LiveKellanovaProvider } from "./live-kellanova"

// ── Credential-gated: Enterprise coupon infrastructure ───────────────────────
import { LiveInmarProvider } from "./live-inmar"
import { LiveCatalinaProvider } from "./live-catalina"
import { LiveQuotientProvider } from "./live-quotient"
import { LiveCouponBureauProvider } from "./live-coupon-bureau"
import { LiveNCRProvider } from "./live-ncr"
import { LiveValassisProvider } from "./live-valassis"

// ── User OAuth loyalty account providers ─────────────────────────────────────
import { LiveKrogerDigitalProvider } from "./live-kroger-digital"
import { LiveTargetCircleProvider } from "./live-target-circle"
import { LiveCvsExtraCareProvider } from "./live-cvs-extracare"
import { LiveWalgreensLoyaltyProvider } from "./live-walgreens-loyalty"
import { LiveSafewayLoyaltyProvider } from "./live-safeway-loyalty"
import { LiveMeijerMperksProvider } from "./live-meijer-mperks"
import { LiveAmazonPrimeProvider } from "./live-amazon-prime"

const ALL_PROVIDERS: BaseProvider[] = [
  // Public / open-data (no credentials needed)
  new LiveOpenFoodFactsProvider(),
  new LiveUsdaProvider(),
  new LiveFlippProvider(),
  new LiveWalmartDealsProvider(),
  new LiveTargetDealsProvider(),
  new LiveCostcoProvider(),
  new LiveAldiProvider(),
  new LiveDollarGeneralProvider(),
  new LiveSamsClubProvider(),
  new LiveFlashfoodProvider(),
  new LiveLozoProvider(),

  // Deal blog / community RSS (no credentials needed)
  new LiveSlickdealsProvider(),
  new LiveHip2SaveProvider(),
  new LiveKclProvider(),
  new LiveSouthernSaversProvider(),
  new LiveRedditDealsProvider(),

  // Credential-gated: Retailer official APIs
  new LiveKrogerProvider(),
  new LiveWalgreensApiProvider(),
  new LiveWalmartApiProvider(),
  new LiveTargetApiProvider(),
  new LiveInstacartProvider(),
  new LiveGoodRxProvider(),

  // Credential-gated: Rebate / cashback apps
  new LiveIbottaProvider(),
  new LiveIbottaPerformanceProvider(),
  new LiveFetchRewardsProvider(),
  new LiveCheckout51Provider(),
  new LiveShopmiumProvider(),
  new LiveRakutenCashbackProvider(),
  new LiveUpsideProvider(),
  new LiveTooGoodToGoProvider(),

  // Credential-gated: Coupon / affiliate networks
  new LiveCouponsDotComProvider(),
  new LiveRetailMeNotProvider(),
  new LiveCJAffiliateProvider(),
  new LiveRakutenAdvertisingProvider(),
  new LiveImpactProvider(),
  new LiveAwinProvider(),
  new LiveShareASaleProvider(),
  new LiveFlexOffersProvider(),

  // Credential-gated: Manufacturer coupon portals
  new LivePGProvider(),
  new LiveGeneralMillsProvider(),
  new LiveKellanovaProvider(),

  // Credential-gated: Enterprise coupon infrastructure
  new LiveInmarProvider(),
  new LiveCatalinaProvider(),
  new LiveQuotientProvider(),
  new LiveCouponBureauProvider(),
  new LiveNCRProvider(),
  new LiveValassisProvider(),

  // User OAuth loyalty account providers
  new LiveKrogerDigitalProvider(),
  new LiveTargetCircleProvider(),
  new LiveCvsExtraCareProvider(),
  new LiveWalgreensLoyaltyProvider(),
  new LiveSafewayLoyaltyProvider(),
  new LiveMeijerMperksProvider(),
  new LiveAmazonPrimeProvider(),
]

const providerRegistry: Record<string, BaseProvider> = {}
for (const provider of ALL_PROVIDERS) {
  providerRegistry[provider.id] = provider
}

export function getProvider(id: string): BaseProvider | undefined {
  return providerRegistry[id]
}

export function getAllProviders(): BaseProvider[] {
  return Object.values(providerRegistry)
}

export function getProviderHealthSummary(): ProviderHealth[] {
  return getAllProviders().map(p => p.getHealth())
}

export async function getProviderHealthSummaryFromDb(): Promise<ProviderHealth[]> {
  const base = getProviderHealthSummary()

  try {
    const [syncRuns, oppCounts] = await Promise.all([
      db.providerSyncRun.findMany({ orderBy: { startedAt: "desc" }, take: 200 }),
      db.opportunity.groupBy({ by: ["providerId"], _count: { id: true }, where: { isActive: true } }),
    ])

    const latestByProvider = new Map<string, typeof syncRuns[0]>()
    for (const run of syncRuns) {
      if (!latestByProvider.has(run.providerId)) latestByProvider.set(run.providerId, run)
    }

    const countByProvider = new Map<string, number>()
    for (const row of oppCounts) {
      countByProvider.set(row.providerId, row._count.id)
    }

    return base.map(p => {
      const lastRun = latestByProvider.get(p.providerId)
      const dbCount = countByProvider.get(p.providerId)
      return {
        ...p,
        ...(lastRun ? { lastSyncAt: lastRun.completedAt ?? lastRun.startedAt } : {}),
        ...(dbCount !== undefined ? { itemCount: dbCount } : {}),
      }
    })
  } catch {
    return base
  }
}
