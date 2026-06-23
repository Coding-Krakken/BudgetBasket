import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const PROMOTIONS_BASE = "https://promotions.api.cj.com/v2"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const GROCERY_KEYWORDS = ["grocery", "food", "household", "pharmacy", "health", "beauty", "supermarket", "market"]

interface CJPromotion {
  "@id"?: string
  "cj:advertisername"?: string
  "cj:promotiondescription"?: string
  "cj:promotiontype"?: string
  "cj:couponcode"?: string
  "cj:discounttype"?: string
  "cj:discountamount"?: string | number
  "cj:promotionenddate"?: string
  "cj:promotionbegindate"?: string
}

interface CJPromotionsChannel {
  "cj:promotions"?: {
    "cj:promotion"?: CJPromotion | CJPromotion[]
  }
}

interface CJResponse {
  cjapi?: {
    rss?: {
      channel?: CJPromotionsChannel
    }
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function isGroceryAdvertiser(name?: string): boolean {
  if (!name) return false
  const lower = name.toLowerCase()
  return GROCERY_KEYWORDS.some((kw) => lower.includes(kw))
}

function mapCJDiscountType(discountType?: string): { valueType: string; isPercent: boolean } {
  const t = (discountType ?? "").toLowerCase()
  if (t.includes("percent") || t.includes("%")) {
    return { valueType: "PERCENT_OFF", isPercent: true }
  }
  return { valueType: "FLAT_DISCOUNT", isPercent: false }
}

async function fetchPromotions(apiKey: string, clientId: string): Promise<CJPromotion[]> {
  const cacheKey = `cj-affiliate:promotions:${clientId}`
  const cached = providerCache.get<CJPromotion[]>(cacheKey)
  if (cached !== null) return cached

  const url = `${PROMOTIONS_BASE}/promotions?website-id=${clientId}&advertiser-ids=joined&promotion-type=Coupon&serviceable-area=US&output=json`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`CJ Affiliate API returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as CJResponse
  const channel = data.cjapi?.rss?.channel
  const raw = channel?.["cj:promotions"]?.["cj:promotion"]

  let promotions: CJPromotion[] = []
  if (Array.isArray(raw)) {
    promotions = raw
  } else if (raw) {
    promotions = [raw]
  }

  // Filter for grocery/household advertisers
  const filtered = promotions.filter((p) => isGroceryAdvertiser(p["cj:advertisername"]))

  providerCache.set(cacheKey, filtered, CACHE_TTL_MS)
  return filtered
}

export class LiveCJAffiliateProvider extends BaseProvider {
  readonly id = "live-cj-affiliate"
  readonly name = "CJ Affiliate Coupon Feed"
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
    const clientId = credentialStore.getCredential(this.id, "client_id")

    if (!apiKey || !clientId) {
      return this.failure(
        "Missing CJ_AFFILIATE_API_KEY and CJ_AFFILIATE_CLIENT_ID. Apply at cj.com/publisher"
      )
    }

    try {
      const promotions = await fetchPromotions(apiKey, clientId)
      const opportunities: ProviderOpportunityData[] = []

      for (const promo of promotions) {
        const description = promo["cj:promotiondescription"]
        if (!description) continue

        const advertiserName = promo["cj:advertisername"]
        const storeSlug = advertiserName ? slugify(advertiserName) : undefined
        const { valueType, isPercent } = mapCJDiscountType(promo["cj:discounttype"])
        const rawAmount = promo["cj:discountamount"]
        const discountAmount = rawAmount ? parseFloat(String(rawAmount)) : 0
        const expiresAt = promo["cj:promotionenddate"] ? new Date(promo["cj:promotionenddate"]) : null
        const startsAt = promo["cj:promotionbegindate"] ? new Date(promo["cj:promotionbegindate"]) : null

        opportunities.push({
          type: "STORE_COUPON",
          title: description,
          storeSlug,
          providerRef: `cj:${promo["@id"] ?? ""}`,
          valueType,
          valueAmount: !isPercent ? discountAmount : 0,
          valuePercent: isPercent ? discountAmount : undefined,
          isMfgCoupon: false,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.85,
          startsAt,
          expiresAt,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "CJ Affiliate API request failed")
    }
  }
}
