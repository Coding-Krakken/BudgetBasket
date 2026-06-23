import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const TOKEN_URL = "https://api.inmar.com/oauth2/token"
const BASE_URL = "https://api.inmar.com/v3"
const PAGE_SIZE = 100
const MAX_PAGES = 20
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const TOKEN_CACHE_KEY = "inmar:token"
const OFFERS_CACHE_KEY = "inmar:promotions:all"

interface InmarTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

interface InmarPromotion {
  promotionId: string
  headline?: string
  description?: string
  promotionType?: string
  offerValue?: number
  offerValueType?: string
  brandName?: string
  upcList?: string[]
  retailerRestrictions?: string[]
  validFrom?: string
  validTo?: string
  termsConditions?: string
  requiresReceipt?: boolean
}

interface InmarPromotionsResponse {
  promotions?: InmarPromotion[]
  totalCount?: number
  pageNumber?: number
  pageSize?: number
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

export class LiveInmarProvider extends BaseProvider {
  readonly id = "live-inmar"
  readonly name = "Inmar Intelligence Promotions"
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
      body: "grant_type=client_credentials&scope=promotions:read",
    })

    if (!res.ok) {
      throw new Error(`Inmar token request failed with HTTP ${res.status}`)
    }

    const data = (await res.json()) as InmarTokenResponse
    const ttlMs = Math.max(((data.expires_in ?? 3600) - 60) * 1000, 60_000)
    providerCache.set(TOKEN_CACHE_KEY, data.access_token, ttlMs)
    return data.access_token
  }

  private async fetchAllPromotions(token: string): Promise<InmarPromotion[]> {
    const cached = providerCache.get<InmarPromotion[]>(OFFERS_CACHE_KEY)
    if (cached !== null) return cached

    const allPromotions: InmarPromotion[] = []
    let pageNumber = 1

    while (pageNumber <= MAX_PAGES) {
      const url = `${BASE_URL}/promotions?type=digital&status=ACTIVE&pageSize=${PAGE_SIZE}&pageNumber=${pageNumber}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (!res.ok) {
        throw new Error(`Inmar promotions API returned HTTP ${res.status} on page ${pageNumber}`)
      }

      const data = (await res.json()) as InmarPromotionsResponse
      const promotions = data.promotions ?? []
      allPromotions.push(...promotions)

      if (promotions.length < PAGE_SIZE) break
      pageNumber++
    }

    providerCache.set(OFFERS_CACHE_KEY, allPromotions, CACHE_TTL_MS)
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
        "Missing INMAR_CLIENT_ID / INMAR_CLIENT_SECRET. Inmar Intelligence requires an enterprise partnership. Contact inmar.com/contact-us to initiate onboarding."
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

        const expiresAt = promotion.validTo ? new Date(promotion.validTo) : null
        const startsAt = promotion.validFrom ? new Date(promotion.validFrom) : null

        // Inmar processes both manufacturer and digital coupons
        const type = promotion.promotionType === "DIGITAL" ? "DIGITAL_COUPON" : "MANUFACTURER_COUPON"

        opportunities.push({
          type,
          title: promotion.headline,
          description: promotion.description,
          brandSlug,
          productSlug,
          providerRef: promotion.promotionId,
          valueType: "FLAT_DISCOUNT",
          valueAmount: promotion.offerValue ?? 0,
          stackability: "STACKABLE_WITH_STORE",
          isMfgCoupon: true,
          requiresClipping: true,
          requiresReceipt: promotion.requiresReceipt ?? false,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.95,
          startsAt,
          expiresAt,
          termsAndConditions: promotion.termsConditions,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Inmar Intelligence API request failed")
    }
  }
}
