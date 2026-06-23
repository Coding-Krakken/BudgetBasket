import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL = "https://api.upside.com/v1"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const DEFAULT_LAT = process.env.UPSIDE_DEFAULT_LAT ?? "40.7128"
const DEFAULT_LNG = process.env.UPSIDE_DEFAULT_LNG ?? "-74.0060"

interface UpsideMerchant {
  name: string
  chain?: string
  lat?: number
  lng?: number
  address?: string
}

interface UpsideOffer {
  id: string | number
  merchant: UpsideMerchant
  cashback_percentage: number
  max_cashback_cents?: number
  offer_type?: string
  expires_at?: string
}

interface UpsideOffersResponse {
  offers?: UpsideOffer[]
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function matchStore(
  name: string,
  stores: Pick<Store, "id" | "slug" | "name">[]
): Pick<Store, "id" | "slug" | "name"> | null {
  const n = name.toLowerCase()
  return (
    stores.find(
      (s) => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n)
    ) ?? null
  )
}

async function fetchGroceryOffers(apiKey: string): Promise<UpsideOffer[]> {
  const cacheKey = `upside:offers:${DEFAULT_LAT},${DEFAULT_LNG}`
  const cached = providerCache.get<UpsideOffer[]>(cacheKey)
  if (cached !== null) return cached

  const url = `${BASE_URL}/offers?lat=${DEFAULT_LAT}&lng=${DEFAULT_LNG}&radius_miles=25&types=grocery`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Upside API returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as UpsideOffersResponse
  const offers = data.offers ?? []

  providerCache.set(cacheKey, offers, CACHE_TTL_MS)
  return offers
}

export class LiveUpsideProvider extends BaseProvider {
  readonly id = "live-upside"
  readonly name = "Upside Gas & Grocery Cashback"
  readonly type = "REBATE_APP" as const
  readonly isDemo = false
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: true,
  }

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([])
  }

  async fetchOpportunities(
    _products?: Pick<Product, "id" | "slug" | "name">[],
    stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const apiKey = credentialStore.getCredential(this.id, "api_key")
    if (!apiKey) {
      return this.failure(
        "Missing UPSIDE_API_KEY. Request access at developers.upside.com"
      )
    }

    try {
      const offers = await fetchGroceryOffers(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const offer of offers) {
        const merchant = offer.merchant
        if (!merchant?.name && !merchant?.chain) continue

        const merchantName = merchant.chain ?? merchant.name
        const matchedStore = stores ? matchStore(merchantName, stores) : null
        const storeSlug = matchedStore?.slug ?? slugify(merchantName)
        const expiresAt = offer.expires_at ? new Date(offer.expires_at) : null
        const maxCashback = offer.max_cashback_cents ? offer.max_cashback_cents / 100 : 0
        const percent = offer.cashback_percentage ?? 0

        opportunities.push({
          type: "CASHBACK",
          title: `Earn ${percent}% cashback at ${merchantName} via Upside`,
          storeSlug,
          providerRef: String(offer.id),
          valueType: "PERCENT_CASHBACK",
          valueAmount: maxCashback,
          valuePercent: percent,
          requiresAccount: true,
          requiresReceipt: true,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.90,
          expiresAt,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Upside API request failed")
    }
  }
}
