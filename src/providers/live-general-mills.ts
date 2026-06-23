import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL = "https://api.goodrewards.generalmills.com/v1"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

const GM_BRANDS = [
  "cheerios", "honey nut cheerios", "lucky charms", "cinnamon toast crunch", "trix",
  "cocoa puffs", "wheaties", "total", "kix", "chex", "fiber one", "nature valley",
  "yoplait", "go-gurt", "pillsbury", "betty crocker", "bisquick", "progresso",
  "old el paso", "totino's", "totinos", "annie's", "annies", "lärabar", "larabar",
  "cascadian farm", "muir glen", "gardetto's", "gardettos", "bugles", "chex mix",
  "häagen-dazs", "haagen-dazs", "wanchai ferry",
]

interface GMOffer {
  id: string
  headline: string
  description?: string
  brand_name?: string
  value?: number
  value_type?: string
  upc_list?: string[]
  expiration_date?: string
  start_date?: string
  terms?: string
}

interface GMOffersResponse {
  offers?: GMOffer[]
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

async function fetchAllOffers(apiKey: string): Promise<GMOffer[]> {
  const cacheKey = "general-mills:offers:all"
  const cached = providerCache.get<GMOffer[]>(cacheKey)
  if (cached !== null) return cached

  const res = await fetch(`${BASE_URL}/offers?status=active`, {
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
    },
  })

  if (!res.ok) {
    throw new Error(`General Mills API returned HTTP ${res.status}`)
  }

  const data = (await res.json()) as GMOffersResponse
  const offers = data?.offers ?? []
  providerCache.set(cacheKey, offers, CACHE_TTL_MS)
  return offers
}

export class LiveGeneralMillsProvider extends BaseProvider {
  readonly id = "live-general-mills"
  readonly name = "General Mills Good Rewards"
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
        "Missing GENERAL_MILLS_API_KEY. Contact General Mills at goodrewards.generalmills.com for publisher API access."
      )
    }

    try {
      const offers = await fetchAllOffers(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const offer of offers) {
        if (!offer.headline) continue

        const brandName = offer.brand_name ?? ""
        const brandSlug = brandName ? toBrandSlug(brandName) : undefined

        // Only include General Mills branded offers
        const brandLower = brandName.toLowerCase()
        const isGMBrand = GM_BRANDS.some((b) => brandLower.includes(b) || b.includes(brandLower))
        if (brandName && !isGMBrand) continue

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
      return this.failure(err instanceof Error ? err.message : "General Mills API request failed")
    }
  }
}
