import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL = "https://api.retailmenot.com/v1"
const PAGE_SIZE = 100
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
const CATEGORIES = ["grocery", "home_garden", "health_beauty"]

interface RetailMeNotDeal {
  id: string | number
  title: string
  description?: string
  merchant_name?: string
  merchant_logo?: string
  discount_type?: string
  discount_value?: number
  code?: string
  expiration_date?: string
  in_store?: boolean
  online?: boolean
  is_verified?: boolean
}

interface RetailMeNotResponse {
  deals?: RetailMeNotDeal[]
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function mapDiscountType(discountType?: string): { valueType: string; hasPercent: boolean } {
  const t = (discountType ?? "").toLowerCase()
  if (t.includes("percent") || t.includes("%")) {
    return { valueType: "PERCENT_OFF", hasPercent: true }
  }
  if (t.includes("flat") || t.includes("dollar") || t.includes("amount")) {
    return { valueType: "FLAT_DISCOUNT", hasPercent: false }
  }
  return { valueType: "FLAT_DISCOUNT", hasPercent: false }
}

async function fetchInStoreDeals(apiKey: string): Promise<RetailMeNotDeal[]> {
  const cacheKey = "retailmenot:deals:in-store"
  const cached = providerCache.get<RetailMeNotDeal[]>(cacheKey)
  if (cached !== null) return cached

  const allDeals: RetailMeNotDeal[] = []
  const seen = new Set<string>()

  for (const category of CATEGORIES) {
    let page = 1
    while (true) {
      const url = `${BASE_URL}/deals?category=${category}&verified=true&page=${page}&per_page=${PAGE_SIZE}`
      const response = await fetch(url, {
        headers: {
          "X-API-Key": apiKey,
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`RetailMeNot API returned HTTP ${response.status} for category ${category} page ${page}`)
      }

      const data = (await response.json()) as RetailMeNotResponse
      const deals = (data.deals ?? []).filter((d) => d.in_store === true)

      for (const deal of deals) {
        const key = String(deal.id)
        if (!seen.has(key)) {
          seen.add(key)
          allDeals.push(deal)
        }
      }

      if ((data.deals ?? []).length < PAGE_SIZE) break
      page++
    }
  }

  providerCache.set(cacheKey, allDeals, CACHE_TTL_MS)
  return allDeals
}

export class LiveRetailMeNotProvider extends BaseProvider {
  readonly id = "live-retailmenot"
  readonly name = "RetailMeNot"
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
        "Missing RETAILMENOT_API_KEY. Apply at retailmenot.com/advertise"
      )
    }

    try {
      const deals = await fetchInStoreDeals(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const deal of deals) {
        if (!deal.title) continue

        const expiresAt = deal.expiration_date ? new Date(deal.expiration_date) : null
        const { valueType, hasPercent } = mapDiscountType(deal.discount_type)
        const storeSlug = deal.merchant_name ? slugify(deal.merchant_name) : undefined

        opportunities.push({
          type: "STORE_COUPON",
          title: deal.title,
          description: deal.description,
          storeSlug,
          providerRef: String(deal.id),
          valueType,
          valueAmount: (!hasPercent && deal.discount_value) ? deal.discount_value : 0,
          valuePercent: (hasPercent && deal.discount_value) ? deal.discount_value : undefined,
          isMfgCoupon: false,
          requiresClipping: false,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.85,
          expiresAt,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "RetailMeNot API request failed")
    }
  }
}
