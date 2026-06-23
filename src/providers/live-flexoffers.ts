import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL = "https://api.flexoffers.com"
const PAGE_SIZE = 100
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
const GROCERY_CATEGORY_ID = 5

const GROCERY_KEYWORDS = ["grocery", "food", "household", "pharmacy", "health", "beauty", "supermarket", "bakery"]

interface FlexOfferPromotion {
  id: string | number
  title: string
  description?: string
  merchant_name?: string
  coupon_code?: string
  discount_type?: string
  discount_value?: number
  start_date?: string
  end_date?: string
  terms?: string
  categories?: string[] | string
  affiliate_link?: string
}

interface FlexOffersResponse {
  data?: FlexOfferPromotion[]
  meta?: {
    current_page?: number
    last_page?: number
    total?: number
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function isGroceryMerchant(merchantName?: string, categories?: string[] | string | null): boolean {
  const catStr = Array.isArray(categories) ? categories.join(" ") : (categories ?? "")
  const haystack = `${merchantName ?? ""} ${catStr}`.toLowerCase()
  return GROCERY_KEYWORDS.some((kw) => haystack.includes(kw))
}

function mapDiscountType(discountType?: string): { valueType: string; isPercent: boolean } {
  const t = (discountType ?? "").toLowerCase()
  if (t.includes("percent") || t.includes("%")) {
    return { valueType: "PERCENT_OFF", isPercent: true }
  }
  return { valueType: "FLAT_DISCOUNT", isPercent: false }
}

async function fetchAllPromotions(apiKey: string): Promise<FlexOfferPromotion[]> {
  const cacheKey = "flexoffers:promotions:all"
  const cached = providerCache.get<FlexOfferPromotion[]>(cacheKey)
  if (cached !== null) return cached

  const allPromos: FlexOfferPromotion[] = []
  const seen = new Set<string>()

  const endpoints = [
    `${BASE_URL}/promotions?promotion_type=coupon&status=active&per_page=${PAGE_SIZE}&page=1`,
    `${BASE_URL}/promotions?category_id=${GROCERY_CATEGORY_ID}&per_page=${PAGE_SIZE}&page=1`,
  ]

  for (const baseUrl of endpoints) {
    let page = 1
    while (true) {
      // Replace page=1 with current page
      const url = baseUrl.replace(/&page=\d+/, `&page=${page}`)
      const response = await fetch(url, {
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`FlexOffers API returned HTTP ${response.status}`)
      }

      const data = (await response.json()) as FlexOffersResponse
      const promos = data.data ?? []

      for (const promo of promos) {
        const key = String(promo.id)
        if (!seen.has(key) && isGroceryMerchant(promo.merchant_name, promo.categories)) {
          seen.add(key)
          allPromos.push(promo)
        }
      }

      if (promos.length < PAGE_SIZE) break
      if (data.meta?.last_page && page >= data.meta.last_page) break
      page++
    }
  }

  providerCache.set(cacheKey, allPromos, CACHE_TTL_MS)
  return allPromos
}

export class LiveFlexOffersProvider extends BaseProvider {
  readonly id = "live-flexoffers"
  readonly name = "FlexOffers Promotions"
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
    if (!apiKey) {
      return this.failure(
        "Missing FLEXOFFERS_API_KEY. Apply at flexoffers.com/publishers"
      )
    }

    try {
      const promos = await fetchAllPromotions(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const promo of promos) {
        if (!promo.title) continue

        const { valueType, isPercent } = mapDiscountType(promo.discount_type)
        const storeSlug = promo.merchant_name ? slugify(promo.merchant_name) : undefined
        const expiresAt = promo.end_date ? new Date(promo.end_date) : null
        const startsAt = promo.start_date ? new Date(promo.start_date) : null

        opportunities.push({
          type: "STORE_COUPON",
          title: promo.title,
          description: promo.description,
          storeSlug,
          providerRef: String(promo.id),
          valueType,
          valueAmount: (!isPercent && promo.discount_value) ? promo.discount_value : 0,
          valuePercent: (isPercent && promo.discount_value) ? promo.discount_value : undefined,
          isMfgCoupon: false,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.83,
          startsAt,
          expiresAt,
          termsAndConditions: promo.terms,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "FlexOffers API request failed")
    }
  }
}
