import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL = "https://api.coupons.com/v1"
const PAGE_SIZE = 200
const MAX_COUPONS = 1000
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
const CATEGORIES = ["grocery", "household", "personal_care"]

interface CouponsDotComCoupon {
  id: string | number
  headline: string
  description?: string
  brand?: string
  retailer?: string
  discount_amount?: number
  discount_percentage?: number
  is_digital?: boolean
  is_printable?: boolean
  upc_list?: string[]
  expiration_date?: string
  terms?: string
  image_url?: string
  offer_type?: string
}

interface CouponsDotComResponse {
  coupons?: CouponsDotComCoupon[]
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

async function fetchAllCoupons(apiKey: string): Promise<CouponsDotComCoupon[]> {
  const cacheKey = "coupons-com:coupons:all"
  const cached = providerCache.get<CouponsDotComCoupon[]>(cacheKey)
  if (cached !== null) return cached

  const allCoupons: CouponsDotComCoupon[] = []
  const seen = new Set<string>()

  for (const category of CATEGORIES) {
    let page = 1
    while (allCoupons.length < MAX_COUPONS) {
      const url = `${BASE_URL}/coupons?status=active&category=${category}&limit=${PAGE_SIZE}&page=${page}`
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Coupons.com API returned HTTP ${response.status} for category ${category} page ${page}`)
      }

      const data = (await response.json()) as CouponsDotComResponse
      const coupons = data.coupons ?? []

      for (const coupon of coupons) {
        const key = String(coupon.id)
        if (!seen.has(key)) {
          seen.add(key)
          allCoupons.push(coupon)
        }
      }

      if (coupons.length < PAGE_SIZE) break
      page++
    }
  }

  providerCache.set(cacheKey, allCoupons, CACHE_TTL_MS)
  return allCoupons
}

export class LiveCouponsDotComProvider extends BaseProvider {
  readonly id = "live-coupons-com"
  readonly name = "Coupons.com"
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
        "Missing COUPONS_COM_API_KEY. Apply at coupons.com/publisher-program"
      )
    }

    try {
      const coupons = await fetchAllCoupons(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const coupon of coupons) {
        if (!coupon.headline) continue

        const expiresAt = coupon.expiration_date ? new Date(coupon.expiration_date) : null
        const hasAmount = coupon.discount_amount != null && coupon.discount_amount > 0
        const hasPercent = coupon.discount_percentage != null && coupon.discount_percentage > 0

        const storeSlug = coupon.retailer ? slugify(coupon.retailer) : undefined

        opportunities.push({
          type: "MANUFACTURER_COUPON",
          title: coupon.headline,
          description: coupon.description,
          storeSlug,
          providerRef: String(coupon.id),
          valueType: hasAmount ? "FLAT_DISCOUNT" : "PERCENT_OFF",
          valueAmount: hasAmount ? (coupon.discount_amount ?? 0) : 0,
          valuePercent: hasPercent ? (coupon.discount_percentage ?? undefined) : undefined,
          isMfgCoupon: true,
          requiresClipping: true,
          stackability: "STACKABLE_WITH_STORE",
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.93,
          expiresAt,
          termsAndConditions: coupon.terms,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Coupons.com API request failed")
    }
  }
}
