import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const TOKEN_URL = "https://api.thecouponbureau.org/v1/auth/token"
const BASE_URL = "https://api.thecouponbureau.org/v1"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const TOKEN_CACHE_KEY = "coupon-bureau:token"
const OFFERS_CACHE_KEY = "coupon-bureau:offers:all"

interface CouponBureauTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

interface CouponBureauProductGroup {
  description?: string
  gtins?: string[]
}

interface CouponBureauOffer {
  offerCode: string
  primaryGtin?: string
  brandName?: string
  productGroups?: CouponBureauProductGroup[]
  couponValue?: number
  offerType?: string
  purchaseRequirements?: string
  terms?: string
  effectiveDate?: string
  expirationDate?: string
}

interface CouponBureauOffersResponse {
  offers?: CouponBureauOffer[]
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

export class LiveCouponBureauProvider extends BaseProvider {
  readonly id = "live-coupon-bureau"
  readonly name = "The Coupon Bureau (AI 8112 Universal)"
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

  private hasCredentials(): boolean {
    return (
      credentialStore.getCredential(this.id, "client_id") !== null &&
      credentialStore.getCredential(this.id, "client_secret") !== null
    )
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
      throw new Error(`Coupon Bureau token request failed with HTTP ${res.status}`)
    }

    const data = (await res.json()) as CouponBureauTokenResponse
    const ttlMs = Math.max(((data.expires_in ?? 3600) - 60) * 1000, 60_000)
    providerCache.set(TOKEN_CACHE_KEY, data.access_token, ttlMs)
    return data.access_token
  }

  private async fetchAllOffers(token: string): Promise<CouponBureauOffer[]> {
    const cached = providerCache.get<CouponBureauOffer[]>(OFFERS_CACHE_KEY)
    if (cached !== null) return cached

    const res = await fetch(`${BASE_URL}/offers?status=active`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })

    if (!res.ok) {
      throw new Error(`Coupon Bureau offers API returned HTTP ${res.status}`)
    }

    const data = (await res.json()) as CouponBureauOffersResponse
    const offers = data.offers ?? []
    providerCache.set(OFFERS_CACHE_KEY, offers, CACHE_TTL_MS)
    return offers
  }

  async validateCoupon(
    ai8112Code: string
  ): Promise<{ valid: boolean; offer?: object; reason?: string }> {
    if (!this.hasCredentials()) {
      return { valid: false, reason: "Provider not configured" }
    }
    try {
      const token = await this.getToken()
      const res = await fetch(
        `${BASE_URL}/coupons/${encodeURIComponent(ai8112Code)}/validate`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (res.status === 200) return { valid: true, offer: (await res.json()) as object }
      if (res.status === 404) return { valid: false, reason: "Coupon not found" }
      if (res.status === 410) return { valid: false, reason: "Coupon expired" }
      return { valid: false, reason: `Validation error: ${res.status}` }
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : "Validation request failed" }
    }
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
    if (!this.hasCredentials()) {
      return this.failure(
        "Missing COUPON_BUREAU_CLIENT_ID / COUPON_BUREAU_CLIENT_SECRET. The Coupon Bureau requires publisher membership. Visit thecouponbureau.org/become-a-member"
      )
    }

    try {
      const token = await this.getToken()
      const offers = await this.fetchAllOffers(token)
      const opportunities: ProviderOpportunityData[] = []

      for (const offer of offers) {
        if (!offer.offerCode) continue

        const brandName = offer.brandName ?? ""
        const brandSlug = brandName ? toBrandSlug(brandName) : undefined

        // Build a descriptive title from product groups or brand + offer type
        const groupDesc = offer.productGroups?.[0]?.description
        const title = groupDesc
          ? `${brandName ? brandName + " " : ""}${groupDesc}`
          : `${brandName || "Coupon Bureau"} ${offer.offerType ?? "Coupon"}`

        const productSlug =
          products && title
            ? (matchProduct(title, products as Pick<Product, "id" | "slug" | "name" | "normalizedName">[])?.slug ?? undefined)
            : undefined

        const expiresAt = offer.expirationDate ? new Date(offer.expirationDate) : null
        const startsAt = offer.effectiveDate ? new Date(offer.effectiveDate) : null

        opportunities.push({
          type: "MANUFACTURER_COUPON",
          title,
          brandSlug,
          productSlug,
          providerRef: offer.offerCode,
          valueType: "FLAT_DISCOUNT",
          valueAmount: offer.couponValue ?? 0,
          stackability: "STACKABLE_WITH_STORE",
          isMfgCoupon: true,
          requiresClipping: false, // AI 8112 universal digital — POS scans automatically
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.98,
          startsAt,
          expiresAt,
          termsAndConditions: offer.terms,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Coupon Bureau API request failed")
    }
  }
}
