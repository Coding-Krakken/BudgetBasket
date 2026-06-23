import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { credentialStore } from "./credential-store";
import { providerCache } from "./cache";

const TOKEN_URL = "https://id.ibotta.com/oauth/token";
const BASE_URL = "https://api.ibottaperformance.com/v2";
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_CACHE_KEY = "ibotta-performance:token";

interface IpnTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

interface IpnRetailer {
  name: string;
  banner_id?: string;
}

interface IpnOffer {
  id: string;
  headline: string;
  description?: string;
  value?: number;
  type?: string;
  terms?: string;
  valid_from?: string;
  valid_to?: string;
  retailers?: IpnRetailer[];
  upcs?: string[];
}

interface IpnOffersResponse {
  data?: IpnOffer[];
  meta?: {
    total_pages?: number;
    current_page?: number;
    total_count?: number;
  };
}

function matchStore(
  name: string,
  stores: Pick<Store, "id" | "slug" | "name">[]
): Pick<Store, "id" | "slug" | "name"> | null {
  const n = name.toLowerCase();
  return (
    stores.find(
      (s) => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n)
    ) ?? null
  );
}

async function fetchToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = providerCache.get<string>(TOKEN_CACHE_KEY);
  if (cached !== null) return cached;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ibotta Performance Network token request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as IpnTokenResponse;
  const ttlMs = Math.max(((data.expires_in ?? 3600) - 60) * 1000, 60_000);
  providerCache.set(TOKEN_CACHE_KEY, data.access_token, ttlMs);
  return data.access_token;
}

async function fetchAllOffers(token: string): Promise<IpnOffer[]> {
  const cacheKey = "ibotta-performance:offers:all";
  const cached = providerCache.get<IpnOffer[]>(cacheKey);
  if (cached !== null) return cached;

  const allOffers: IpnOffer[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = `${BASE_URL}/offers?page[size]=${PAGE_SIZE}&page[number]=${page}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Ibotta Performance Network API returned HTTP ${response.status} on page ${page}`);
    }

    const data = (await response.json()) as IpnOffersResponse;
    const offers = data.data ?? [];
    allOffers.push(...offers);

    const totalPages = data.meta?.total_pages ?? 1;
    if (page >= totalPages || offers.length < PAGE_SIZE) break;
    page++;
  }

  providerCache.set(cacheKey, allOffers, CACHE_TTL_MS);
  return allOffers;
}

export class LiveIbottaPerformanceProvider extends BaseProvider {
  readonly id = "live-ibotta-performance";
  readonly name = "Ibotta Performance Network";
  readonly type = "REBATE_APP" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: true,
  };

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([]);
  }

  async fetchOpportunities(
    _products?: Pick<Product, "id" | "slug" | "name">[],
    stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const clientId = credentialStore.getCredential(this.id, "client_id");
    const clientSecret = credentialStore.getCredential(this.id, "client_secret");

    if (!clientId || !clientSecret) {
      return this.failure(
        "No IBOTTA_PERFORMANCE_CLIENT_ID / IBOTTA_PERFORMANCE_CLIENT_SECRET configured. " +
        "Apply for the Ibotta Performance Network partner program at https://home.ibotta.com/publisher-network/"
      );
    }

    try {
      const token = await fetchToken(clientId, clientSecret);
      const offers = await fetchAllOffers(token);
      const opportunities: ProviderOpportunityData[] = [];

      for (const offer of offers) {
        if (!offer.headline) continue;

        const expiresAt = offer.valid_to ? new Date(offer.valid_to) : null;
        const startsAt = offer.valid_from ? new Date(offer.valid_from) : null;
        const retailers = offer.retailers ?? [];

        if (retailers.length === 0) {
          opportunities.push({
            type: "REBATE",
            title: offer.headline,
            description: offer.description,
            providerRef: offer.id,
            valueType: "FLAT_REBATE",
            valueAmount: offer.value ?? 0,
            stackability: "STACKABLE_WITH_STORE",
            isMfgCoupon: true,
            requiresAccount: true,
            requiresReceipt: true,
            confidenceLevel: "OFFICIAL_API",
            confidence: 0.95,
            startsAt,
            expiresAt,
            termsAndConditions: offer.terms,
          });
        } else {
          for (const retailer of retailers) {
            const matchedStore = stores ? matchStore(retailer.name, stores) : null;
            const storeSlug =
              matchedStore?.slug ??
              retailer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            opportunities.push({
              type: "REBATE",
              title: offer.headline,
              description: offer.description,
              storeSlug,
              providerRef: offer.id,
              valueType: "FLAT_REBATE",
              valueAmount: offer.value ?? 0,
              stackability: "STACKABLE_WITH_STORE",
              isMfgCoupon: true,
              requiresAccount: true,
              requiresReceipt: true,
              confidenceLevel: "OFFICIAL_API",
              confidence: 0.95,
              startsAt,
              expiresAt,
              termsAndConditions: offer.terms,
            });
          }
        }
      }

      return this.success(opportunities);
    } catch (err) {
      return this.failure(
        err instanceof Error ? err.message : "Ibotta Performance Network API request failed"
      );
    }
  }
}
