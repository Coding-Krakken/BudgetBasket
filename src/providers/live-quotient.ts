import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const TOKEN_URL = "https://api.quotient.com/v1/oauth/token"
const BASE_URL = "https://api.quotient.com/v2"
const PAGE_SIZE = 200
const MAX_PAGES = 10
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const TOKEN_CACHE_KEY = "quotient:token"
const OFFERS_CACHE_KEY = "quotient:offers:all"

interface QuotientTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

interface QuotientOffer {
  offerId: string
  headline?: string
  description?: string
  brand?: string
  retailerIds?: string[]
  discountValue?: number
  discountType?: string
  isDigital?: boolean
  isPrintable?: boolean
  expirationDate?: string
  startDate?: string
  upcList?: string[]
  terms?: string
}

interface QuotientOffersResponse {
  offers?: QuotientOffer[]
  page?: number
  totalPages?: number
  totalCount?: number
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

export class LiveQuotientProvider extends BaseProvider {
  readonly id = "live-quotient"
  readonly name = "Quotient / Neptune Retail Solutions"
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
      throw new Error(`Quotient token request failed with HTTP ${res.status}`)
    }

    const data = (await res.json()) as QuotientTokenResponse
    const ttlMs = Math.max(((data.expires_in ?? 3600) - 60) * 1000, 60_000)
    providerCache.set(TOKEN_CACHE_KEY, data.access_token, ttlMs)
    return data.access_token
  }

  private async fetchAllOffers(token: string): Promise<QuotientOffer[]> {
    const cached = providerCache.get<QuotientOffer[]>(OFFERS_CACHE_KEY)
    if (cached !== null) return cached

    const allOffers: QuotientOffer[] = []
    let page = 1

    while (page <= MAX_PAGES) {
      const url = `${BASE_URL}/offers?status=active&category=grocery&page=${page}&pageSize=${PAGE_SIZE}`
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (!res.ok) {
        throw new Error(`Quotient offers API returned HTTP ${res.status} on page ${page}`)
      }

      const data = (await res.json()) as QuotientOffersResponse
      const offers = data.offers ?? []
      allOffers.push(...offers)

      const totalPages = data.totalPages ?? 1
      if (page >= totalPages || offers.length < PAGE_SIZE) break
      page++
    }

    providerCache.set(OFFERS_CACHE_KEY, allOffers, CACHE_TTL_MS)
    return allOffers
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
        "Missing QUOTIENT_CLIENT_ID / QUOTIENT_CLIENT_SECRET. Neptune Retail Solutions requires a publisher partnership. Visit quotient.com/publisher to apply."
      )
    }

    try {
      const token = await this.getToken()
      const offers = await this.fetchAllOffers(token)
      const opportunities: ProviderOpportunityData[] = []

      for (const offer of offers) {
        if (!offer.headline) continue

        const brandName = offer.brand ?? ""
        const brandSlug = brandName ? toBrandSlug(brandName) : undefined

        const productSlug =
          products && offer.headline
            ? (matchProduct(offer.headline, products as Pick<Product, "id" | "slug" | "name" | "normalizedName">[])?.slug ?? undefined)
            : undefined

        const expiresAt = offer.expirationDate ? new Date(offer.expirationDate) : null
        const startsAt = offer.startDate ? new Date(offer.startDate) : null

        const valueType = offer.discountType === "PERCENT" ? "PERCENT_OFF" : "FLAT_DISCOUNT"

        opportunities.push({
          type: "MANUFACTURER_COUPON",
          title: offer.headline,
          description: offer.description,
          brandSlug,
          productSlug,
          providerRef: offer.offerId,
          valueType,
          valueAmount: offer.discountValue ?? 0,
          stackability: "STACKABLE_WITH_STORE",
          isMfgCoupon: true,
          requiresClipping: true,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.95,
          startsAt,
          expiresAt,
          termsAndConditions: offer.terms,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Quotient API request failed")
    }
  }
}
