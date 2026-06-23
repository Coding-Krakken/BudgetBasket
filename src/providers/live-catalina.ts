import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const TOKEN_URL = "https://api.catalinamarketing.com/v1/auth/oauth/token"
const BASE_URL = "https://api.catalinamarketing.com/v1"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const TOKEN_CACHE_KEY = "catalina:token"
const PROMOTIONS_CACHE_KEY = "catalina:promotions:all"

interface CatalinaTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

interface CatalinaProductCondition {
  upcList?: string[]
  brandName?: string
  categoryName?: string
}

interface CatalinaPromotion {
  id: string
  name?: string
  description?: string
  type?: string
  triggerType?: string
  triggerValue?: number
  rewardType?: string
  rewardValue?: number
  startDate?: string
  endDate?: string
  brandName?: string
  productConditions?: CatalinaProductCondition[]
  rewardConditions?: CatalinaProductCondition[]
}

interface CatalinaPromotionsResponse {
  promotions?: CatalinaPromotion[]
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

function toBrandSlug(brandName: string): string {
  return brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function mapTriggerTypeToOpportunityType(triggerType?: string): string {
  switch (triggerType) {
    case "SPEND_THRESHOLD":
      return "SPEND_X_GET_REWARD"
    case "QUANTITY":
      return "BUY_X_GET_Y"
    case "PRODUCT":
    default:
      return "STORE_COUPON"
  }
}

export class LiveCatalinaProvider extends BaseProvider {
  readonly id = "live-catalina"
  readonly name = "Catalina Marketing Promotions"
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

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials",
    })

    if (!res.ok) {
      throw new Error(`Catalina token request failed with HTTP ${res.status}`)
    }

    const data = (await res.json()) as CatalinaTokenResponse
    const ttlMs = Math.max(((data.expires_in ?? 3600) - 60) * 1000, 60_000)
    providerCache.set(TOKEN_CACHE_KEY, data.access_token, ttlMs)
    return data.access_token
  }

  private async fetchPromotions(token: string): Promise<CatalinaPromotion[]> {
    const cached = providerCache.get<CatalinaPromotion[]>(PROMOTIONS_CACHE_KEY)
    if (cached !== null) return cached

    const res = await fetch(`${BASE_URL}/promotions?status=ACTIVE&category=grocery`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })

    if (!res.ok) {
      throw new Error(`Catalina promotions API returned HTTP ${res.status}`)
    }

    const data = (await res.json()) as CatalinaPromotionsResponse
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
        "Missing CATALINA_CLIENT_ID / CATALINA_CLIENT_SECRET. Catalina Marketing requires a retailer or brand partnership. Contact catalinamarketing.com to learn more."
      )
    }

    try {
      const token = await this.getToken()
      const promotions = await this.fetchPromotions(token)
      const opportunities: ProviderOpportunityData[] = []

      for (const promotion of promotions) {
        const title = promotion.name
        if (!title) continue

        const brandName = promotion.brandName ?? ""
        const brandSlug = brandName ? toBrandSlug(brandName) : undefined

        const productSlug =
          products && title
            ? (matchProduct(title, products as Pick<Product, "id" | "slug" | "name" | "normalizedName">[])?.slug ?? undefined)
            : undefined

        const expiresAt = promotion.endDate ? new Date(promotion.endDate) : null
        const startsAt = promotion.startDate ? new Date(promotion.startDate) : null

        const type = mapTriggerTypeToOpportunityType(promotion.triggerType)

        // Catalina promotions can be funded by either manufacturer or retailer
        // Use rewardType to infer; MANUFACTURER_FUNDED = isMfgCoupon: true
        const isMfgCoupon = promotion.type === "MANUFACTURER_FUNDED"

        opportunities.push({
          type,
          title,
          description: promotion.description,
          brandSlug,
          productSlug,
          providerRef: promotion.id,
          valueType: "FLAT_DISCOUNT",
          valueAmount: promotion.rewardValue ?? 0,
          stackability: "STACKABLE_WITH_STORE",
          isMfgCoupon,
          requiresClipping: true,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.95,
          startsAt,
          expiresAt,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Catalina Marketing API request failed")
    }
  }
}
