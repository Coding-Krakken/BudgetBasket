import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL_PRIMARY = "https://api.pgeveryday.com/v1"
const BASE_URL_FALLBACK = "https://coupons.pgeveryday.com/api"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

const PG_BRANDS = [
  "tide", "downy", "bounce", "gain", "febreze", "mr. clean", "swiffer",
  "cascade", "dawn", "pampers", "luvs", "charmin", "bounty", "puffs",
  "crest", "oral-b", "scope", "pantene", "head & shoulders", "herbal essences",
  "aussie", "old spice", "gillette", "venus", "secret", "olay", "sk-ii",
  "always", "tampax", "vicks", "zzzquil", "metamucil", "pepto-bismol",
  "nyquil", "dayquil",
]

interface PGOffer {
  id: string
  headline: string
  description?: string
  brand_name?: string
  value?: number
  value_type?: string
  upc_list?: string[]
  expiration_date?: string
  start_date?: string
  redemption_limit?: number
  terms?: string
  image_url?: string
}

interface PGOffersResponse {
  offers?: PGOffer[]
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

async function fetchAllOffers(apiKey: string): Promise<PGOffer[]> {
  const cacheKey = "pg:offers:all"
  const cached = providerCache.get<PGOffer[]>(cacheKey)
  if (cached !== null) return cached

  let data: PGOffersResponse | null = null

  // Try primary endpoint
  try {
    const res = await fetch(`${BASE_URL_PRIMARY}/coupons?status=active`, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
    })
    if (res.ok) {
      data = (await res.json()) as PGOffersResponse
    }
  } catch {
    // fall through to alternative
  }

  // Try alternative endpoint
  if (!data) {
    const res = await fetch(`${BASE_URL_FALLBACK}/offers?active=true`, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
    })
    if (!res.ok) {
      throw new Error(`P&G API returned HTTP ${res.status}`)
    }
    data = (await res.json()) as PGOffersResponse
  }

  const offers = data?.offers ?? []
  providerCache.set(cacheKey, offers, CACHE_TTL_MS)
  return offers
}

export class LivePGProvider extends BaseProvider {
  readonly id = "live-pg"
  readonly name = "P&G Good Everyday (Manufacturer Coupons)"
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
    products?: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const apiKey = credentialStore.getCredential(this.id, "api_key")
    if (!apiKey) {
      return this.failure(
        "Missing PG_API_KEY. Contact P&G marketing partnerships at pgeveryday.com to request publisher API access."
      )
    }

    try {
      const offers = await fetchAllOffers(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const offer of offers) {
        if (!offer.headline) continue

        const brandName = offer.brand_name ?? ""
        const brandSlug = brandName ? toBrandSlug(brandName) : undefined

        // Only include P&G branded offers
        const brandLower = brandName.toLowerCase()
        const isPGBrand = PG_BRANDS.some((b) => brandLower.includes(b) || b.includes(brandLower))
        if (brandName && !isPGBrand) continue

        const productSlug =
          products && offer.headline
            ? (matchProduct(offer.headline, products as Pick<Product, "id" | "slug" | "name" | "normalizedName">[])?.slug ?? undefined)
            : undefined

        const expiresAt = offer.expiration_date ? new Date(offer.expiration_date) : null
        const startsAt = offer.start_date ? new Date(offer.start_date) : null

        opportunities.push({
          type: "MANUFACTURER_COUPON",
          title: offer.headline,
          description: offer.description,
          brandSlug,
          productSlug,
          providerRef: offer.id,
          valueType: "FLAT_DISCOUNT",
          valueAmount: offer.value ?? 0,
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
      return this.failure(err instanceof Error ? err.message : "P&G API request failed")
    }
  }
}
