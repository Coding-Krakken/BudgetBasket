import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const API_VERSION = "2.8"
const BASE_URL = "https://shareasale.com/x.cfm"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const GROCERY_KEYWORDS = ["grocery", "food", "household", "pharmacy", "health", "beauty", "supermarket", "bakery", "deli"]

interface ShareASaleCoupon {
  merchantname?: string
  couponcode?: string
  discounttype?: string
  discountvalue?: string | number
  startdate?: string
  enddate?: string
  description?: string
  categories?: string
  couponTitle?: string
  title?: string
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function isGroceryMerchant(merchantName?: string, categories?: string): boolean {
  const haystack = `${merchantName ?? ""} ${categories ?? ""}`.toLowerCase()
  return GROCERY_KEYWORDS.some((kw) => haystack.includes(kw))
}

function mapDiscountType(discountType?: string): { valueType: string; isPercent: boolean } {
  const t = (discountType ?? "").toLowerCase()
  if (t.includes("percent") || t.includes("%") || t === "p") {
    return { valueType: "PERCENT_OFF", isPercent: true }
  }
  return { valueType: "FLAT_DISCOUNT", isPercent: false }
}

async function buildSignature(
  affiliateId: string,
  token: string,
  secret: string,
  date: string,
  action: string
): Promise<string> {
  const message = `${affiliateId}:${token}:${date}:${API_VERSION}:${action}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function fetchCoupons(
  affiliateId: string,
  token: string,
  secret: string
): Promise<ShareASaleCoupon[]> {
  const cacheKey = `shareasale:coupons:${affiliateId}`
  const cached = providerCache.get<ShareASaleCoupon[]>(cacheKey)
  if (cached !== null) return cached

  const action = "getCoupons"
  const date = new Date().toUTCString()
  const signature = await buildSignature(affiliateId, token, secret, date, action)

  const url = `${BASE_URL}?action=${action}&affiliateId=${affiliateId}&token=${token}&version=${API_VERSION}&APIVersion=${API_VERSION}&merchantId=0&output=json`
  const response = await fetch(url, {
    headers: {
      "x-ShareASale-Date": date,
      "x-ShareASale-Authentication": signature,
      "x-ShareASale-APIVersion": API_VERSION,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`ShareASale API returned HTTP ${response.status}`)
  }

  const data = await response.json()
  // ShareASale returns an array or an object with a data key
  const coupons: ShareASaleCoupon[] = Array.isArray(data) ? data : (data.data ?? [])

  const filtered = coupons.filter((c) =>
    isGroceryMerchant(c.merchantname, c.categories)
  )

  providerCache.set(cacheKey, filtered, CACHE_TTL_MS)
  return filtered
}

export class LiveShareASaleProvider extends BaseProvider {
  readonly id = "live-shareasale"
  readonly name = "ShareASale Promotions"
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
    _products?: Pick<Product, "id" | "slug" | "name">[],
    _stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const token = credentialStore.getCredential(this.id, "api_key")
    const affiliateId = credentialStore.getCredential(this.id, "client_id")
    const secret = credentialStore.getCredential(this.id, "client_secret")

    if (!token || !affiliateId || !secret) {
      return this.failure(
        "Missing SHAREASALE credentials. Apply at shareasale.com/join"
      )
    }

    try {
      const coupons = await fetchCoupons(affiliateId, token, secret)
      const opportunities: ProviderOpportunityData[] = []

      for (const coupon of coupons) {
        const title = coupon.couponTitle ?? coupon.title ?? coupon.description
        if (!title) continue

        const { valueType, isPercent } = mapDiscountType(coupon.discounttype)
        const rawValue = coupon.discountvalue
        const discountValue = rawValue ? parseFloat(String(rawValue)) : 0
        const storeSlug = coupon.merchantname ? slugify(coupon.merchantname) : undefined
        const expiresAt = coupon.enddate ? new Date(coupon.enddate) : null
        const startsAt = coupon.startdate ? new Date(coupon.startdate) : null

        opportunities.push({
          type: "STORE_COUPON",
          title,
          description: coupon.description,
          storeSlug,
          valueType,
          valueAmount: !isPercent ? discountValue : 0,
          valuePercent: isPercent ? discountValue : undefined,
          isMfgCoupon: false,
          confidenceLevel: "OFFICIAL_API",
          confidence: 0.83,
          startsAt,
          expiresAt,
        })
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "ShareASale API request failed")
    }
  }
}
