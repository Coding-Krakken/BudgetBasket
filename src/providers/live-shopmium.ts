import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL = "https://api.shopmium.com/v2"
const PAGE_SIZE = 100
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface ShopmiumOffer {
  id: string | number
  name: string
  description?: string
  cashback_amount: number
  currency?: string
  brand_name?: string
  partner_eans?: string[]
  partner_upcs?: string[]
  valid_from?: string
  valid_until?: string
  retailer_exclusivity?: string
}

interface ShopmiumResponse {
  data?: ShopmiumOffer[]
  meta?: {
    current_page?: number
    last_page?: number
    total?: number
  }
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

async function fetchAllOffers(apiKey: string): Promise<ShopmiumOffer[]> {
  const cacheKey = "shopmium:offers:all"
  const cached = providerCache.get<ShopmiumOffer[]>(cacheKey)
  if (cached !== null) return cached

  const allOffers: ShopmiumOffer[] = []
  let page = 1

  while (true) {
    const url = `${BASE_URL}/offers?country=US&active=true&page=${page}&per_page=${PAGE_SIZE}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Shopmium API returned HTTP ${response.status} on page ${page}`)
    }

    const data = (await response.json()) as ShopmiumResponse
    const offers = data.data ?? []
    allOffers.push(...offers)

    if (offers.length < PAGE_SIZE) break
    if (data.meta?.last_page && page >= data.meta.last_page) break
    page++
  }

  providerCache.set(cacheKey, allOffers, CACHE_TTL_MS)
  return allOffers
}

export class LiveShopmiumProvider extends BaseProvider {
  readonly id = "live-shopmium"
  readonly name = "Shopmium"
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
        "Missing SHOPMIUM_API_KEY. Apply at shopmium.com/partners"
      )
    }

    try {
      const offers = await fetchAllOffers(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const offer of offers) {
        if (!offer.name) continue

        const startsAt = offer.valid_from ? new Date(offer.valid_from) : null
        const expiresAt = offer.valid_until ? new Date(offer.valid_until) : null

        let storeSlug: string | undefined
        if (offer.retailer_exclusivity) {
          const matchedStore = stores ? matchStore(offer.retailer_exclusivity, stores) : null
          storeSlug = matchedStore?.slug ?? slugify(offer.retailer_exclusivity)
        }

        opportunities.push({
          type: "REBATE",
          title: offer.name,
          description: offer.description,
          storeSlug,
          providerRef: String(offer.id),
          valueType: "FLAT_REBATE",
          valueAmount: offer.cashback_amount ?? 0,
          isMfgCoupon: true,
          stackability: "STACKABLE_WITH_STORE",
          requiresAccount: true,
          requiresReceipt: true,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.90,
          startsAt,
          expiresAt,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Shopmium API request failed")
    }
  }
}
