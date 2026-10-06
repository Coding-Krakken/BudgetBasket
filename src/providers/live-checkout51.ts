import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const PUBLIC_ENDPOINT = "https://www.checkout51.com/api/v2/offers?status=active"
const FALLBACK_ENDPOINT = "https://checkout51.com/api/mobile/2.0/home?platform=android"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface Checkout51Offer {
  id: string | number
  title?: string
  description?: string
  minimum_purchase?: number
  discount: number
  expiry?: string
  brand?: string
  category?: string
  product_name?: string
  valid_at?: string[]
  image?: string
}

interface Checkout51Response {
  offers?: Checkout51Offer[]
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
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

async function fetchOffers(apiKey: string | null): Promise<{ offers: Checkout51Offer[]; isAuthenticated: boolean }> {
  const cacheKey = `checkout51:offers:${apiKey ? "auth" : "public"}`
  const cached = providerCache.get<{ offers: Checkout51Offer[]; isAuthenticated: boolean }>(cacheKey)
  if (cached !== null) return cached

  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`
  }

  let data: Checkout51Response | null = null
  const isAuthenticated = !!apiKey

  for (const endpoint of [PUBLIC_ENDPOINT, FALLBACK_ENDPOINT]) {
    try {
      const response = await fetch(endpoint, { headers })
      if (response.ok) {
        const json = await response.json()
        // Handle both { offers: [...] } and direct array or nested structures
        if (Array.isArray(json)) {
          data = { offers: json as Checkout51Offer[] }
        } else if (json?.offers) {
          data = json as Checkout51Response
        } else if (json?.data?.offers) {
          data = { offers: json.data.offers as Checkout51Offer[] }
        }
        if (data) break
      }
    } catch {
      // Try next endpoint
    }
  }

  if (!data) {
    throw new Error("Checkout 51 API not accessible. Sign up at checkout51.com")
  }

  const result = { offers: data.offers ?? [], isAuthenticated }
  providerCache.set(cacheKey, result, CACHE_TTL_MS)
  return result
}

export class LiveCheckout51Provider extends BaseProvider {
  readonly id = "live-checkout51"
  readonly name = "Checkout 51"
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
    products?: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const apiKey = credentialStore.getCredential(this.id, "api_key")

    try {
      const { offers, isAuthenticated } = await fetchOffers(apiKey)
      const opportunities: ProviderOpportunityData[] = []

      for (const offer of offers) {
        if (!offer.title && !offer.product_name) continue

        const title = offer.title ?? offer.product_name ?? "Checkout 51 Offer"
        const expiresAt = offer.expiry ? new Date(offer.expiry) : null

        // Match product if available
        const productSlug =
          offer.product_name && products
            ? (matchProduct(offer.product_name, products as Pick<Product, "id" | "slug" | "name" | "normalizedName">[])?.slug ?? undefined)
            : undefined

        const validStores = offer.valid_at ?? []

        if (validStores.length === 0) {
          opportunities.push({
            type: "REBATE",
            title,
            description: offer.description,
            productSlug,
            providerRef: String(offer.id),
            valueType: "FLAT_REBATE",
            valueAmount: offer.discount ?? 0,
            minimumPurchase: offer.minimum_purchase,
            stackability: "STACKABLE_WITH_STORE",
            requiresAccount: true,
            requiresReceipt: true,
            confidenceLevel: isAuthenticated ? "OFFICIAL_API" : "PUBLIC_PAGE",
            confidence: 0.85,
            expiresAt,
          })
        } else {
          for (const storeName of validStores) {
            const matchedStore = stores ? matchStore(storeName, stores) : null
            const storeSlug = matchedStore?.slug ?? slugify(storeName)

            opportunities.push({
              type: "REBATE",
              title,
              description: offer.description,
              storeSlug,
              productSlug,
              providerRef: String(offer.id),
              valueType: "FLAT_REBATE",
              valueAmount: offer.discount ?? 0,
              minimumPurchase: offer.minimum_purchase,
              stackability: "STACKABLE_WITH_STORE",
              requiresAccount: true,
              requiresReceipt: true,
              confidenceLevel: isAuthenticated ? "OFFICIAL_API" : "PUBLIC_PAGE",
              confidence: 0.85,
              expiresAt,
            })
          }
        }
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Checkout 51 API request failed")
    }
  }
}
