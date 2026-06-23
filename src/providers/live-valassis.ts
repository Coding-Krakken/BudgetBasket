import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const TOKEN_URL = "https://api.vericast.com/v1/oauth/token"
const BASE_URL = "https://api.vericast.com/v1"
const PAGE_SIZE = 100
const MAX_PAGES = 20
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const TOKEN_CACHE_KEY = "valassis:token"
const PROMOTIONS_CACHE_KEY = "valassis:promotions:all"

interface ValassisTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

interface ValassisPromotion {
  id: string
  offerType?: string
  headline?: string
  description?: string
  brandName?: string
  upcList?: string[]
  discountValue?: number
  discountType?: string
  purchaseRequirements?: string
  expirationDate?: string
  startDate?: string
  redemptionChannel?: string
  terms?: string
}

interface ValassisPromotionsResponse {
  promotions?: ValassisPromotion[]
  page?: number
  per_page?: number
  total?: number
  total_pages?: number
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

export class LiveValassisProvider extends BaseProvider {
  readonly id = "live-valassis"
  readonly name = "Valassis / Vericast Promotions"
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
      throw new Error(`Valassis token request failed with HTTP ${res.status}`)
    }

    const data = (await res.json()) as ValassisTokenResponse
    const ttlMs = Math.max(((data.expires_in ?? 3600) - 60) * 1000, 60_000)
    providerCache.set(TOKEN_CACHE_KEY, data.access_token, ttlMs)
    return data.access_token
  }

  private async fetchAllPromotions(token: string): Promise<ValassisPromotion[]> {
    const cached = providerCache.get<ValassisPromotion[]>(PROMOTIONS_CACHE_KEY)
    if (cached !== null) return cached

    const allPromotions: ValassisPromotion[] = []
    let page = 1

    while (page <= MAX_PAGES) {
      const url = `${BASE_URL}/promotions?type=digital&market=US&status=active&page=${page}&per_page=${PAGE_SIZE}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (!res.ok) {
        throw new Error(`Valassis promotions API returned HTTP ${res.status} on page ${page}`)
      }

      const data = (await res.json()) as ValassisPromotionsResponse
      const promotions = data.promotions ?? []
      allPromotions.push(...promotions)

      const totalPages = data.total_pages ?? 1
      if (page >= totalPages || promotions.length < PAGE_SIZE) break
      page++
    }

    providerCache.set(PROMOTIONS_CACHE_KEY, allPromotions, CACHE_TTL_MS)
    return allPromotions
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
        "Missing VALASSIS_CLIENT_ID / VALASSIS_CLIENT_SECRET. Vericast / Valassis requires an enterprise publisher agreement. Visit vericast.com/solutions/digital-promotions to apply."
      )
    }

    try {
      const token = await this.getToken()
      const promotions = await this.fetchAllPromotions(token)
      const opportunities: ProviderOpportunityData[] = []

      for (const promotion of promotions) {
        if (!promotion.headline) continue

        const brandName = promotion.brandName ?? ""
        const brandSlug = brandName ? toBrandSlug(brandName) : undefined

        const productSlug =
          products && promotion.headline
            ? (matchProduct(promotion.headline, products as Pick<Product, "id" | "slug" | "name" | "normalizedName">[])?.slug ?? undefined)
            : undefined

        const expiresAt = promotion.expirationDate ? new Date(promotion.expirationDate) : null
        const startsAt = promotion.startDate ? new Date(promotion.startDate) : null

        const valueType = promotion.discountType === "PERCENT" ? "PERCENT_OFF" : "FLAT_DISCOUNT"

        // Digital redemption channel = no clipping required; print/FSI = clipping required
        const requiresClipping = promotion.redemptionChannel === "DIGITAL" ? false : true

        opportunities.push({
          type: "MANUFACTURER_COUPON",
          title: promotion.headline,
          description: promotion.description,
          brandSlug,
          productSlug,
          providerRef: promotion.id,
          valueType,
          valueAmount: promotion.discountValue ?? 0,
          stackability: "STACKABLE_WITH_STORE",
          isMfgCoupon: true,
          requiresClipping,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.90,
          startsAt,
          expiresAt,
          termsAndConditions: promotion.terms,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Valassis / Vericast API request failed")
    }
  }
}
