import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL_KELLANOVA = "https://api.kellanova.com/v1"
const BASE_URL_KELLOGGS = "https://api.kelloggs.com/v1"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// Kellanova brands (post-split company)
const KELLANOVA_BRANDS = [
  "pringles", "pop-tarts", "pop tarts", "cheez-it", "cheez it",
  "rice krispies treats", "keebler", "famous amos", "rxbar",
  "nutri-grain", "nutri grain", "morningstar farms", "morningstar", "eggo",
]

// WK Kellogg brands (separate company after split)
const WK_KELLOGG_BRANDS = [
  "frosted flakes", "froot loops", "fruit loops", "apple jacks",
  "corn flakes", "rice krispies", "special k", "raisin bran",
  "mini-wheats", "mini wheats", "smart start",
]

const ALL_BRANDS = [...KELLANOVA_BRANDS, ...WK_KELLOGG_BRANDS]

interface KellanovaCoupon {
  id: string
  title?: string
  headline?: string
  description?: string
  brand?: string
  value?: number
  expiry?: string
  start_date?: string
  upc_list?: string[]
  terms?: string
}

interface KellanovaResponse {
  coupons?: KellanovaCoupon[]
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

async function fetchAllCoupons(apiKey: string): Promise<KellanovaCoupon[]> {
  const cacheKey = "kellanova:coupons:all"
  const cached = providerCache.get<KellanovaCoupon[]>(cacheKey)
  if (cached !== null) return cached

  let data: KellanovaResponse | null = null

  // Try Kellanova API first
  try {
    const res = await fetch(`${BASE_URL_KELLANOVA}/coupons?active=true`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    })
    if (res.ok) {
      data = (await res.json()) as KellanovaResponse
    }
  } catch {
    // fall through to Kellogg's endpoint
  }

  // Try Kellogg's endpoint
  if (!data) {
    const res = await fetch(`${BASE_URL_KELLOGGS}/offers?status=active`, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
    })
    if (!res.ok) {
      throw new Error(`Kellanova API returned HTTP ${res.status}`)
    }
    data = (await res.json()) as KellanovaResponse
  }

  const coupons = data?.coupons ?? []
  providerCache.set(cacheKey, coupons, CACHE_TTL_MS)
  return coupons
}

export class LiveKellanovaProvider extends BaseProvider {
  readonly id = "live-kellanova"
  readonly name = "Kellanova / WK Kellogg Coupons"
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
        "Missing KELLANOVA_API_KEY. Contact Kellanova at kellanova.com for coupon publisher access."
      )
    }

    try {
      const coupons = await fetchAllCoupons(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const coupon of coupons) {
        const headline = coupon.title ?? coupon.headline
        if (!headline) continue

        const brandName = coupon.brand ?? ""
        const brandSlug = brandName ? toBrandSlug(brandName) : undefined

        // Only include Kellanova / WK Kellogg branded items
        const brandLower = brandName.toLowerCase()
        const isKnownBrand = ALL_BRANDS.some((b) => brandLower.includes(b) || b.includes(brandLower))
        if (brandName && !isKnownBrand) continue

        const productSlug =
          products && headline
            ? (matchProduct(headline, products as Pick<Product, "id" | "slug" | "name" | "normalizedName">[])?.slug ?? undefined)
            : undefined

        const expiresAt = coupon.expiry ? new Date(coupon.expiry) : null
        const startsAt = coupon.start_date ? new Date(coupon.start_date) : null

        opportunities.push({
          type: "MANUFACTURER_COUPON",
          title: headline,
          description: coupon.description,
          brandSlug,
          productSlug,
          providerRef: coupon.id,
          valueType: "FLAT_DISCOUNT",
          valueAmount: coupon.value ?? 0,
          stackability: "STACKABLE_WITH_STORE",
          isMfgCoupon: true,
          requiresClipping: true,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.95,
          startsAt,
          expiresAt,
          termsAndConditions: coupon.terms,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Kellanova API request failed")
    }
  }
}
