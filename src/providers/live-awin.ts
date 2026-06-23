import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const API_BASE = "https://api.awin.com"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const GROCERY_SECTORS = ["grocery", "food", "household", "pharmacy", "health", "beauty", "supermarket"]

interface AwinAdvertiser {
  id: string | number
  name: string
  primaryRegion?: string
  primarySector?: string
}

interface AwinDiscount {
  amount?: number
  currency?: string
  type?: string
  percentage?: number
}

interface AwinPromotion {
  id: string | number
  title: string
  description?: string
  code?: string
  type?: string
  advertiser: AwinAdvertiser
  discount?: AwinDiscount
  startDate?: string
  endDate?: string
  terms?: string
}

interface AwinPromotionsResponse {
  promotions?: AwinPromotion[]
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function isGrocerySector(sector?: string, name?: string): boolean {
  const haystack = `${sector ?? ""} ${name ?? ""}`.toLowerCase()
  return GROCERY_SECTORS.some((kw) => haystack.includes(kw))
}

function mapAwinDiscountType(discount?: AwinDiscount): { valueType: string; isPercent: boolean } {
  const t = (discount?.type ?? "").toLowerCase()
  if (t.includes("percent") || t.includes("%") || (discount?.percentage ?? 0) > 0) {
    return { valueType: "PERCENT_OFF", isPercent: true }
  }
  return { valueType: "FLAT_DISCOUNT", isPercent: false }
}

function isMfgCoupon(sector?: string): boolean {
  const s = (sector ?? "").toLowerCase()
  return s.includes("manufacturer") || s.includes("cpg") || s.includes("brand")
}

async function fetchGroceryPromotions(
  apiKey: string,
  publisherId: string
): Promise<AwinPromotion[]> {
  const cacheKey = `awin:promotions:${publisherId}`
  const cached = providerCache.get<AwinPromotion[]>(cacheKey)
  if (cached !== null) return cached

  const url = `${API_BASE}/publishers/${publisherId}/promotions?relationship=joined&type=voucher&status=active&region=US`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Awin API returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as AwinPromotionsResponse
  const promotions = (data.promotions ?? []).filter(
    (p) =>
      p.advertiser?.primaryRegion === "US" ||
      isGrocerySector(p.advertiser?.primarySector, p.advertiser?.name)
  )

  providerCache.set(cacheKey, promotions, CACHE_TTL_MS)
  return promotions
}

export class LiveAwinProvider extends BaseProvider {
  readonly id = "live-awin"
  readonly name = "Awin Affiliate Promotions"
  readonly type = "COUPON_NETWORK" as const
  readonly isDemo = false
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  }

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([])
  }

  async fetchOpportunities(
    _products?: Pick<Product, "id" | "slug" | "name">[],
    _stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const apiKey = credentialStore.getCredential(this.id, "api_key")
    const publisherId = credentialStore.getCredential(this.id, "client_id")

    if (!apiKey || !publisherId) {
      return this.failure(
        "Missing AWIN_API_KEY / AWIN_CLIENT_ID. Apply at awin.com/publishers"
      )
    }

    try {
      const promotions = await fetchGroceryPromotions(apiKey, publisherId)
      const opportunities: ProviderOpportunityData[] = []

      for (const promo of promotions) {
        if (!promo.title) continue

        const advertiserName = promo.advertiser?.name
        const storeSlug = advertiserName ? slugify(advertiserName) : undefined
        const { valueType, isPercent } = mapAwinDiscountType(promo.discount)
        const expiresAt = promo.endDate ? new Date(promo.endDate) : null
        const startsAt = promo.startDate ? new Date(promo.startDate) : null
        const sector = promo.advertiser?.primarySector
        const mfg = isMfgCoupon(sector)

        opportunities.push({
          type: mfg ? "MANUFACTURER_COUPON" : "STORE_COUPON",
          title: promo.title,
          description: promo.description,
          storeSlug,
          providerRef: String(promo.id),
          valueType,
          valueAmount: (!isPercent && promo.discount?.amount) ? promo.discount.amount : 0,
          valuePercent: (isPercent && promo.discount?.percentage) ? promo.discount.percentage : undefined,
          isMfgCoupon: mfg,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.85,
          startsAt,
          expiresAt,
          termsAndConditions: promo.terms,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Awin API request failed")
    }
  }
}
