import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const AUTH_URL = "https://api.rakutenadvertising.com/auth/token"
const API_BASE = "https://api.rakutenadvertising.com/v1"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const GROCERY_CATEGORIES = ["grocery", "food", "household", "pharmacy", "health", "beauty", "supermarket"]

interface RakutenAdvToken {
  access_token: string
  expires_in: number
  token_type: string
}

interface RakutenAdvAdvertiser {
  name: string
  category?: string
  id?: string | number
}

interface RakutenAdvPromotion {
  promotion_id: string | number
  title: string
  description?: string
  advertiser: RakutenAdvAdvertiser
  coupon_code?: string
  discount_type?: string
  discount_value?: number
  start_date?: string
  end_date?: string
  advertiser_id?: string | number
  terms?: string
}

interface RakutenAdvPromotionsResponse {
  data?: RakutenAdvPromotion[]
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function isGroceryCategory(category?: string): boolean {
  if (!category) return false
  const lower = category.toLowerCase()
  return GROCERY_CATEGORIES.some((kw) => lower.includes(kw))
}

function mapDiscountType(discountType?: string): { valueType: string; isPercent: boolean } {
  const t = (discountType ?? "").toLowerCase()
  if (t.includes("percent") || t.includes("%")) {
    return { valueType: "PERCENT_OFF", isPercent: true }
  }
  return { valueType: "FLAT_DISCOUNT", isPercent: false }
}

async function getAccessToken(clientId: string, apiKey: string): Promise<string> {
  const cacheKey = "rakuten-advertising:token"
  const cached = providerCache.get<string>(cacheKey)
  if (cached !== null) return cached

  const credentials = Buffer.from(`${clientId}:${apiKey}`).toString("base64")
  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  })

  if (!response.ok) {
    throw new Error(`Rakuten Advertising auth returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as RakutenAdvToken
  const ttl = (data.expires_in ?? 3600) * 1000
  providerCache.set(cacheKey, data.access_token, ttl - 60_000) // subtract 1 min for safety
  return data.access_token
}

async function fetchGroceryPromotions(
  accessToken: string,
  clientId: string
): Promise<RakutenAdvPromotion[]> {
  const cacheKey = `rakuten-advertising:promotions:${clientId}`
  const cached = providerCache.get<RakutenAdvPromotion[]>(cacheKey)
  if (cached !== null) return cached

  const url = `${API_BASE}/publishers/${clientId}/promotions?relationship=joined&status=Active&category=Grocery`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Rakuten Advertising promotions API returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as RakutenAdvPromotionsResponse
  const promotions = (data.data ?? []).filter(
    (p) => isGroceryCategory(p.advertiser?.category) || isGroceryCategory("grocery")
  )

  providerCache.set(cacheKey, promotions, CACHE_TTL_MS)
  return promotions
}

export class LiveRakutenAdvertisingProvider extends BaseProvider {
  readonly id = "live-rakuten-advertising"
  readonly name = "Rakuten Advertising Coupon Feed"
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
    const clientId = credentialStore.getCredential(this.id, "client_id")
    const apiKey = credentialStore.getCredential(this.id, "api_key")

    if (!clientId || !apiKey) {
      return this.failure(
        "Missing RAKUTEN_ADVERTISING_CLIENT_ID / _API_KEY. Apply at rakutenadvertising.com"
      )
    }

    try {
      const accessToken = await getAccessToken(clientId, apiKey)
      const promotions = await fetchGroceryPromotions(accessToken, clientId)
      const opportunities: ProviderOpportunityData[] = []

      for (const promo of promotions) {
        if (!promo.title) continue

        const advertiserName = promo.advertiser?.name
        const storeSlug = advertiserName ? slugify(advertiserName) : undefined
        const { valueType, isPercent } = mapDiscountType(promo.discount_type)
        const expiresAt = promo.end_date ? new Date(promo.end_date) : null
        const startsAt = promo.start_date ? new Date(promo.start_date) : null

        opportunities.push({
          type: "STORE_COUPON",
          title: promo.title,
          description: promo.description,
          storeSlug,
          providerRef: String(promo.promotion_id),
          valueType,
          valueAmount: (!isPercent && promo.discount_value) ? promo.discount_value : 0,
          valuePercent: (isPercent && promo.discount_value) ? promo.discount_value : undefined,
          isMfgCoupon: false,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.85,
          startsAt,
          expiresAt,
          termsAndConditions: promo.terms,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Rakuten Advertising API request failed")
    }
  }
}
