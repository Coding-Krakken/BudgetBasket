import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const TOKEN_URL = "https://api.ncrvoyix.com/security/authentication/v1/token"
const BASE_URL = "https://api.ncrvoyix.com/commerce/nep-promotion-engine/v1"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const TOKEN_CACHE_KEY = "ncr:token"
const PROMOTIONS_CACHE_KEY = "ncr:promotions:all"

interface NCRTokenResponse {
  token?: string
  accessToken?: string
  access_token?: string
  expiresIn?: number
  expires_in?: number
}

interface NCRTargetItem {
  upcList?: string[]
  itemId?: string
  categoryId?: string
}

interface NCRPromotion {
  promotionId: string
  name?: string
  description?: string
  promotionType?: string
  triggerType?: string
  rewardType?: string
  discountValue?: number
  discountType?: string
  startDate?: string
  endDate?: string
  targetItems?: NCRTargetItem[]
}

interface NCRPromotionsResponse {
  promotions?: NCRPromotion[]
}

function matchProduct(
  text: string,
  products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[]
): Pick<Product, "id" | "slug" | "name" | "normalizedName"> | null {
  const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim()
  return (
    products.find((p) => {
      const pn = p.normalizedName.toLowerCase()
      const words = pn.split(" ").filter((w) => w.length > 3)
      return words.length > 0 && words.every((w) => norm.includes(w))
    }) ?? null
  )
}

function mapPromotionType(promotionType?: string): string {
  switch (promotionType) {
    case "PRODUCT_DISCOUNT":
      return "STORE_SALE"
    case "BASKET_DISCOUNT":
      return "SPEND_X_GET_REWARD"
    case "BUY_GET":
      return "BUY_X_GET_Y"
    default:
      return "STORE_SALE"
  }
}

export class LiveNCRProvider extends BaseProvider {
  readonly id = "live-ncr"
  readonly name = "NCR Voyix Retail Promotions"
  readonly type = "COUPON_NETWORK" as const
  readonly isDemo = false
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: true,
  }

  private async getToken(): Promise<string> {
    const cached = providerCache.get<string>(TOKEN_CACHE_KEY)
    if (cached !== null) return cached

    const clientId = credentialStore.getCredential(this.id, "client_id")!
    const clientSecret = credentialStore.getCredential(this.id, "client_secret")!

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    })

    if (!res.ok) {
      throw new Error(`NCR Voyix token request failed with HTTP ${res.status}`)
    }

    const data = (await res.json()) as NCRTokenResponse
    const accessToken = data.access_token ?? data.accessToken ?? data.token
    if (!accessToken) {
      throw new Error("NCR Voyix token response did not include an access token")
    }

    const expiresIn = data.expires_in ?? data.expiresIn ?? 3600
    const ttlMs = Math.max((expiresIn - 60) * 1000, 60_000)
    providerCache.set(TOKEN_CACHE_KEY, accessToken, ttlMs)
    return accessToken
  }

  private async fetchPromotions(token: string): Promise<NCRPromotion[]> {
    const cached = providerCache.get<NCRPromotion[]>(PROMOTIONS_CACHE_KEY)
    if (cached !== null) return cached

    const siteId = process.env.NCR_SITE_ID ?? ""
    const params = new URLSearchParams({ status: "ACTIVE" })
    if (siteId) params.set("enterpriseUnit", siteId)

    const res = await fetch(`${BASE_URL}/promotions?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })

    if (!res.ok) {
      throw new Error(`NCR Voyix promotions API returned HTTP ${res.status}`)
    }

    const data = (await res.json()) as NCRPromotionsResponse
    const promotions = data.promotions ?? []
    providerCache.set(PROMOTIONS_CACHE_KEY, promotions, CACHE_TTL_MS)
    return promotions
  }

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([])
  }

  async fetchOpportunities(
    products?: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const clientId = credentialStore.getCredential(this.id, "client_id")
    const clientSecret = credentialStore.getCredential(this.id, "client_secret")

    if (!clientId || !clientSecret) {
      return this.failure(
        "Missing NCR_CLIENT_ID / NCR_CLIENT_SECRET. NCR Voyix integration requires a retail partner agreement. Visit ncrvoyix.com/commerce to learn more."
      )
    }

    try {
      const token = await this.getToken()
      const promotions = await this.fetchPromotions(token)
      const opportunities: ProviderOpportunityData[] = []

      for (const promotion of promotions) {
        const title = promotion.name
        if (!title) continue

        const productSlug =
          products && title
            ? (matchProduct(title, products as Pick<Product, "id" | "slug" | "name" | "normalizedName">[])?.slug ?? undefined)
            : undefined

        const expiresAt = promotion.endDate ? new Date(promotion.endDate) : null
        const startsAt = promotion.startDate ? new Date(promotion.startDate) : null

        const type = mapPromotionType(promotion.promotionType)
        const valueType = promotion.discountType === "PERCENT" ? "PERCENT_OFF" : "FLAT_DISCOUNT"

        opportunities.push({
          type,
          title,
          description: promotion.description,
          productSlug,
          providerRef: promotion.promotionId,
          valueType,
          valueAmount: promotion.discountValue ?? 0,
          stackability: "STACKABLE_WITH_STORE",
          isMfgCoupon: false,
          requiresClipping: false,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.95,
          startsAt,
          expiresAt,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "NCR Voyix API request failed")
    }
  }
}
