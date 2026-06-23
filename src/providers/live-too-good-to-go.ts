import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const TGTG_BASE = "https://apptoogoodtogo.com/api"
const TGTG_USER_AGENT =
  "TGTG/23.3.11 Dalvik/2.1.0 (Linux; U; Android 9; Pixel 3 Build/PQ3B.190801.002)"
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes (stock changes frequently)
const PAGE_SIZE = 50

interface TGTGMonetaryValue {
  minor_units: number
  decimals: number
  code?: string
}

interface TGTGPickupInterval {
  start?: string
  end?: string
}

interface TGTGItem {
  item_id: string
  price_including_taxes?: TGTGMonetaryValue
  value_including_taxes?: TGTGMonetaryValue
  cover_picture?: { current_url?: string }
  name?: string
  can_user_supply_packaging?: boolean
}

interface TGTGStore {
  store_id: string
  store_name: string
  store_location?: { address?: { address_line?: string } }
  logo_picture?: { current_url?: string }
}

interface TGTGListingItem {
  item: TGTGItem
  store: TGTGStore
  display_name: string
  items_available: number
  sold_out_at?: string
  pickup_interval?: TGTGPickupInterval
  pickup_location?: { address?: { address_line?: string } }
}

interface TGTGSessionResponse {
  access_token: string
  refresh_token: string
  user_id: string
  access_token_ttl_seconds?: number
}

interface TGTGItemsResponse {
  items?: TGTGListingItem[]
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

async function getSession(accessToken: string): Promise<TGTGSessionResponse> {
  const cacheKey = "tgtg:session"
  const cached = providerCache.get<TGTGSessionResponse>(cacheKey)
  if (cached !== null) return cached

  const response = await fetch(`${TGTG_BASE}/auth/v3/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": TGTG_USER_AGENT,
    },
    body: JSON.stringify({ device_type: "ANDROID", access_token: accessToken }),
  })

  if (!response.ok) {
    throw new Error(`TGTG auth returned HTTP ${response.status}`)
  }

  const session = (await response.json()) as TGTGSessionResponse
  const ttl = (session.access_token_ttl_seconds ?? 3600) * 1000
  providerCache.set(cacheKey, session, ttl)
  return session
}

async function fetchItems(
  session: TGTGSessionResponse
): Promise<TGTGListingItem[]> {
  const cacheKey = `tgtg:items:${session.user_id}`
  const cached = providerCache.get<TGTGListingItem[]>(cacheKey)
  if (cached !== null) return cached

  const allItems: TGTGListingItem[] = []
  let page = 1

  while (true) {
    const response = await fetch(`${TGTG_BASE}/item/v7/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": TGTG_USER_AGENT,
      },
      body: JSON.stringify({
        user_id: session.user_id,
        radius: 50,
        page,
        page_size: PAGE_SIZE,
        discover: false,
        favorites_only: false,
        with_stock_only: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`TGTG items API returned HTTP ${response.status} on page ${page}`)
    }

    const data = (await response.json()) as TGTGItemsResponse
    const items = data.items ?? []
    allItems.push(...items)

    if (items.length < PAGE_SIZE) break
    page++
  }

  providerCache.set(cacheKey, allItems, CACHE_TTL_MS)
  return allItems
}

export class LiveTooGoodToGoProvider extends BaseProvider {
  readonly id = "live-too-good-to-go"
  readonly name = "Too Good To Go Surplus Bags"
  readonly type = "RETAILER" as const
  readonly isDemo = false
  readonly capabilities: ProviderCapability = {
    prices: true,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  }

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    const accessToken = credentialStore.getCredential(this.id, "api_key")
    if (!accessToken) {
      return this.failure(
        "Missing TOO_GOOD_TO_GO_API_KEY. Get access token from TGTG app or https://github.com/ahivert/tgtg-python for details."
      )
    }

    try {
      const session = await getSession(accessToken)
      const items = await fetchItems(session)
      const prices: ProviderPriceData[] = []

      for (const listing of items) {
        if (!listing.item?.price_including_taxes) continue

        const price =
          listing.item.price_including_taxes.minor_units /
          Math.pow(10, listing.item.price_including_taxes.decimals)

        const storeName = listing.store.store_name
        const matchedStore = matchStore(storeName, stores)
        const storeSlug = matchedStore?.slug ?? slugify(storeName)
        const pickupStart = listing.pickup_interval?.start
          ? new Date(listing.pickup_interval.start)
          : null

        prices.push({
          productSlug: `tgtg-bag-${slugify(listing.display_name)}`,
          storeSlug,
          price,
          source: "tgtg-api",
          confidence: 0.92,
          expiresAt: pickupStart,
        })
      }

      return this.success(prices)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Too Good To Go API request failed")
    }
  }

  async fetchOpportunities(
    _products?: Pick<Product, "id" | "slug" | "name">[],
    stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const accessToken = credentialStore.getCredential(this.id, "api_key")
    if (!accessToken) {
      return this.failure(
        "Missing TOO_GOOD_TO_GO_API_KEY. Get access token from TGTG app or https://github.com/ahivert/tgtg-python for details."
      )
    }

    try {
      const session = await getSession(accessToken)
      const items = await fetchItems(session)
      const opportunities: ProviderOpportunityData[] = []

      for (const listing of items) {
        if (!listing.item?.price_including_taxes) continue

        const price =
          listing.item.price_including_taxes.minor_units /
          Math.pow(10, listing.item.price_including_taxes.decimals)

        const originalValue = listing.item.value_including_taxes
          ? listing.item.value_including_taxes.minor_units /
            Math.pow(10, listing.item.value_including_taxes.decimals)
          : null

        const discountPercent =
          originalValue && originalValue > price
            ? Math.round(((originalValue - price) / originalValue) * 100)
            : null

        const storeName = listing.store.store_name
        const matchedStore = stores ? matchStore(storeName, stores) : null
        const storeSlug = matchedStore?.slug ?? slugify(storeName)

        const pickupStart = listing.pickup_interval?.start
          ? new Date(listing.pickup_interval.start)
          : null

        const title = discountPercent
          ? `Surprise Bag – ${listing.display_name} (Save up to ${discountPercent}%)`
          : `Surprise Bag – ${listing.display_name}`

        opportunities.push({
          type: "CLEARANCE",
          title,
          storeSlug,
          providerRef: listing.item.item_id,
          valueType: "FIXED_PRICE",
          valueAmount: price,
          valuePercent: discountPercent ?? undefined,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.92,
          expiresAt: pickupStart,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Too Good To Go API request failed")
    }
  }
}
