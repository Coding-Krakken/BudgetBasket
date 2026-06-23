import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL = "https://api.fetchrewards.com/partner/v1"
const PAGE_SIZE = 200
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface FetchOffer {
  id: string
  title: string
  description?: string
  brand_name?: string
  points_awarded: number
  partner_ids?: string[]
  upc_list?: string[]
  retailer_names?: string[]
  terms?: string
  start_date?: string
  end_date?: string
  offer_type?: string
}

interface FetchOffersResponse {
  offers?: FetchOffer[]
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

async function fetchAllOffers(apiKey: string): Promise<FetchOffer[]> {
  const cacheKey = "fetch-rewards:offers:all"
  const cached = providerCache.get<FetchOffer[]>(cacheKey)
  if (cached !== null) return cached

  const allOffers: FetchOffer[] = []
  let offset = 0

  while (true) {
    const url = `${BASE_URL}/offers?status=active&limit=${PAGE_SIZE}&offset=${offset}`
    const response = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Fetch Rewards API returned HTTP ${response.status} at offset ${offset}`)
    }

    const data = (await response.json()) as FetchOffersResponse
    const offers = data.offers ?? []
    allOffers.push(...offers)

    if (offers.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  providerCache.set(cacheKey, allOffers, CACHE_TTL_MS)
  return allOffers
}

export class LiveFetchRewardsProvider extends BaseProvider {
  readonly id = "live-fetch-rewards"
  readonly name = "Fetch Rewards"
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
        "Missing FETCH_REWARDS_API_KEY. Apply for partner access at developers.fetchrewards.com"
      )
    }

    try {
      const offers = await fetchAllOffers(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const offer of offers) {
        if (!offer.title) continue

        const points = offer.points_awarded ?? 0
        const dollarValue = points / 100
        const startsAt = offer.start_date ? new Date(offer.start_date) : null
        const expiresAt = offer.end_date ? new Date(offer.end_date) : null
        const title = `Earn $${dollarValue.toFixed(2)} with Fetch: ${offer.title}`

        const retailerNames = offer.retailer_names ?? []

        if (retailerNames.length === 0) {
          opportunities.push({
            type: "CASHBACK",
            title,
            description: offer.description,
            providerRef: offer.id,
            valueType: "POINTS_REWARD",
            valueAmount: dollarValue,
            stackability: "STACKABLE_WITH_STORE",
            requiresAccount: true,
            requiresReceipt: true,
            confidenceLevel: "OFFICIAL_API",
            confidence: 0.90,
            startsAt,
            expiresAt,
            termsAndConditions: offer.terms,
          })
        } else {
          for (const retailerName of retailerNames) {
            const matchedStore = stores ? matchStore(retailerName, stores) : null
            const storeSlug = matchedStore?.slug ?? slugify(retailerName)

            opportunities.push({
              type: "CASHBACK",
              title,
              description: offer.description,
              storeSlug,
              providerRef: offer.id,
              valueType: "POINTS_REWARD",
              valueAmount: dollarValue,
              stackability: "STACKABLE_WITH_STORE",
              requiresAccount: true,
              requiresReceipt: true,
              confidenceLevel: "OFFICIAL_API",
              confidence: 0.90,
              startsAt,
              expiresAt,
              termsAndConditions: offer.terms,
            })
          }
        }
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Fetch Rewards API request failed")
    }
  }
}
