import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const API_BASE = "https://api.impact.com"
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

const GROCERY_KEYWORDS = ["grocery", "food", "household", "pharmacy", "health", "beauty", "supermarket", "market"]

interface ImpactCampaign {
  Id: string | number
  Name: string
  Description?: string
  AdvertiserName?: string
  FlatRate?: number
  PercentPerSale?: number
  Category?: string
}

interface ImpactCampaignsResponse {
  Campaigns?: ImpactCampaign[]
}

interface ImpactPromo {
  Id: string | number
  Label: string
  Description?: string
  PromoType?: string
  Code?: string
  Amount?: number
  StartDate?: string
  EndDate?: string
  Terms?: string
}

interface ImpactPromosResponse {
  Promos?: ImpactPromo[]
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function isGroceryAdvertiser(name?: string, category?: string): boolean {
  const haystack = `${name ?? ""} ${category ?? ""}`.toLowerCase()
  return GROCERY_KEYWORDS.some((kw) => haystack.includes(kw))
}

function mapPromoType(promoType?: string): { valueType: string; isPercent: boolean } {
  const t = (promoType ?? "").toLowerCase()
  if (t.includes("percent") || t.includes("%")) {
    return { valueType: "PERCENT_OFF", isPercent: true }
  }
  return { valueType: "FLAT_DISCOUNT", isPercent: false }
}

async function fetchGroceryCampaigns(
  clientId: string,
  clientSecret: string
): Promise<ImpactCampaign[]> {
  const cacheKey = `impact:campaigns:${clientId}`
  const cached = providerCache.get<ImpactCampaign[]>(cacheKey)
  if (cached !== null) return cached

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const url = `${API_BASE}/Mediapartners/${clientId}/Campaigns?Status=Running&Category=Grocery`
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Impact.com Campaigns API returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as ImpactCampaignsResponse
  const campaigns = (data.Campaigns ?? []).filter((c) =>
    isGroceryAdvertiser(c.AdvertiserName ?? c.Name, c.Category)
  )

  providerCache.set(cacheKey, campaigns, CACHE_TTL_MS)
  return campaigns
}

async function fetchCampaignPromos(
  clientId: string,
  clientSecret: string,
  campaignId: string | number
): Promise<ImpactPromo[]> {
  const cacheKey = `impact:promos:${clientId}:${campaignId}`
  const cached = providerCache.get<ImpactPromo[]>(cacheKey)
  if (cached !== null) return cached

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const url = `${API_BASE}/Mediapartners/${clientId}/Campaigns/${campaignId}/Promos?Status=APPROVED`
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    // Non-fatal per campaign
    return []
  }

  const data = (await response.json()) as ImpactPromosResponse
  const promos = data.Promos ?? []
  providerCache.set(cacheKey, promos, CACHE_TTL_MS)
  return promos
}

export class LiveImpactProvider extends BaseProvider {
  readonly id = "live-impact"
  readonly name = "Impact.com Partner Promotions"
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
    const clientId = credentialStore.getCredential(this.id, "client_id")
    const clientSecret = credentialStore.getCredential(this.id, "client_secret")

    if (!clientId || !clientSecret) {
      return this.failure(
        "Missing IMPACT_CLIENT_ID / _CLIENT_SECRET. Apply at impact.com/affiliate-media-partner"
      )
    }

    try {
      const campaigns = await fetchGroceryCampaigns(clientId, clientSecret)
      const opportunities: ProviderOpportunityData[] = []

      for (const campaign of campaigns) {
        const storeSlug = campaign.AdvertiserName
          ? slugify(campaign.AdvertiserName)
          : undefined

        const promos = await fetchCampaignPromos(clientId, clientSecret, campaign.Id)

        for (const promo of promos) {
          if (!promo.Label) continue

          const { valueType, isPercent } = mapPromoType(promo.PromoType)
          const expiresAt = promo.EndDate ? new Date(promo.EndDate) : null
          const startsAt = promo.StartDate ? new Date(promo.StartDate) : null

          opportunities.push({
            type: "STORE_COUPON",
            title: promo.Label,
            description: promo.Description,
            storeSlug,
            providerRef: String(promo.Id),
            valueType,
            valueAmount: (!isPercent && promo.Amount) ? promo.Amount : 0,
            valuePercent: (isPercent && promo.Amount) ? promo.Amount : undefined,
            isMfgCoupon: false,
            confidenceLevel: "OFFICIAL_API",
            confidence: 0.85,
            startsAt,
            expiresAt,
            termsAndConditions: promo.Terms,
          })
        }
      }

      return this.success(opportunities)
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : "Impact.com API request failed")
    }
  }
}
