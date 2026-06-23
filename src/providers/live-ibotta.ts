import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { credentialStore } from "./credential-store";
import { providerCache } from "./cache";

const BASE_URL = "https://apis.ibotta.com/v1";
const MAX_OFFERS = 500;
const PAGE_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface IbottaRetailer {
  name: string;
  banner_id?: string;
}

interface IbottaOffer {
  id: string;
  headline: string;
  description?: string;
  value?: number;
  type?: string;
  terms?: string;
  valid_from?: string;
  valid_to?: string;
  retailers?: IbottaRetailer[];
  upcs?: string[];
}

interface IbottaOffersResponse {
  offers?: IbottaOffer[];
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

async function fetchAllOffers(apiKey: string): Promise<IbottaOffer[]> {
  const cacheKey = "ibotta:offers:all";
  const cached = providerCache.get<IbottaOffer[]>(cacheKey);
  if (cached !== null) return cached;

  const allOffers: IbottaOffer[] = [];
  let offset = 0;

  while (offset < MAX_OFFERS) {
    const url = `${BASE_URL}/offers?limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Ibotta API returned HTTP ${response.status} at offset ${offset}`);
    }

    const data = (await response.json()) as IbottaOffersResponse;
    const offers = data.offers ?? [];
    allOffers.push(...offers);

    if (offers.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  providerCache.set(cacheKey, allOffers, CACHE_TTL_MS);
  return allOffers;
}

export class LiveIbottaProvider extends BaseProvider {
  readonly id = "live-ibotta";
  readonly name = "Ibotta";
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
    const apiKey = credentialStore.getCredential(this.id, "api_key");
    if (!apiKey) {
      return this.failure(
        "No IBOTTA_API_KEY configured. Apply for the Ibotta Performance Network lite tier at https://home.ibotta.com/publisher-network/"
      );
    }

    try {
      const offers = await fetchAllOffers(apiKey);
      const opportunities: ProviderOpportunityData[] = [];

      for (const offer of offers) {
        if (!offer.headline) continue;

        const expiresAt = offer.valid_to ? new Date(offer.valid_to) : null;
        const startsAt = offer.valid_from ? new Date(offer.valid_from) : null;

        const retailers = offer.retailers ?? [];
        if (retailers.length === 0) {
          // Global offer — no store restriction
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
      return this.failure(err instanceof Error ? err.message : "Ibotta API request failed");
    }
  }
}
