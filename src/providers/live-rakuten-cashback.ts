import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const BASE_URL = "https://api.rakuten.com/v1"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const GROCERY_CATEGORIES = ["grocery", "household", "pharmacy", "food", "health", "beauty"]

interface RakutenMerchant {
  id: string | number
  name: string
  cashback_percent: number
  cashback_type?: string
  max_cashback_amount?: number
  is_in_store?: boolean
  category?: string
}

interface RakutenMerchantsResponse {
  merchants?: RakutenMerchant[]
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

async function fetchGroceryMerchants(apiKey: string): Promise<RakutenMerchant[]> {
  const cacheKey = "rakuten-cashback:merchants:grocery"
  const cached = providerCache.get<RakutenMerchant[]>(cacheKey)
  if (cached !== null) return cached

  const url = `${BASE_URL}/merchants?category=grocery&country=US&status=active`
  const response = await fetch(url, {
    headers: {
      "X-App-Key": apiKey,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Rakuten Cashback API returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as RakutenMerchantsResponse
  const merchants = (data.merchants ?? []).filter((m) => {
    if (m.is_in_store) return true
    const cat = (m.category ?? "").toLowerCase()
    return GROCERY_CATEGORIES.some((gc) => cat.includes(gc))
  })

  providerCache.set(cacheKey, merchants, CACHE_TTL_MS)
  return merchants
}

export class LiveRakutenCashbackProvider extends BaseProvider {
  readonly id = "live-rakuten-cashback"
  readonly name = "Rakuten Cashback"
  readonly type = "REBATE_APP" as const
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
    _products?: Pick<Product, "id" | "slug" | "name">[],
    stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const apiKey = credentialStore.getCredential(this.id, "api_key")
    if (!apiKey) {
      return this.failure(
        "Missing RAKUTEN_CASHBACK_API_KEY. Register at rakuten.com/business"
      )
    }

    try {
      const merchants = await fetchGroceryMerchants(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const merchant of merchants) {
        if (!merchant.name) continue

        const matchedStore = stores ? matchStore(merchant.name, stores) : null
        const storeSlug = matchedStore?.slug ?? slugify(merchant.name)
        const percent = merchant.cashback_percent ?? 0

        opportunities.push({
          type: "CASHBACK",
          title: `Earn ${percent}% cashback via Rakuten at ${merchant.name}`,
          description: `Earn ${percent}% cashback via Rakuten at ${merchant.name}`,
          storeSlug,
          providerRef: String(merchant.id),
          valueType: "PERCENT_CASHBACK",
          valueAmount: merchant.max_cashback_amount ?? 0,
          valuePercent: percent,
          requiresAccount: true,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.88,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Rakuten Cashback API request failed")
    }
  }
}
