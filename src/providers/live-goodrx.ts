import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const PHARMACY_CATEGORY_HINTS = [
  "pharmacy",
  "medication",
  "prescription",
  "vitamin",
  "supplement",
  "otc",
  "drug",
  "health",
  "medicine",
  "rx",
];

// Common pharmacy chain slug mappings
const PHARMACY_SLUG_MAP: Record<string, string> = {
  cvs: "cvs",
  walgreens: "walgreens",
  "rite aid": "rite-aid",
  "rite-aid": "rite-aid",
  walmart: "walmart",
  kroger: "kroger",
  "sam's club": "sams-club",
  costco: "costco",
  "harris teeter": "harris-teeter",
  publix: "publix",
  "safeway": "safeway",
  "albertsons": "albertsons",
};

function matchProduct(text: string, products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[]) {
  const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  return products.find(p => {
    const pn = p.normalizedName.toLowerCase();
    const words = pn.split(' ').filter(w => w.length > 3);
    return words.length > 0 && words.every(w => norm.includes(w));
  }) ?? null;
}

function matchStore(name: string, stores: Pick<Store, "id" | "slug" | "name">[]) {
  const n = name.toLowerCase();
  return stores.find(s => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n)) ?? null;
}

function isPharmacyProduct(product: Pick<Product, "name">): boolean {
  const nameLower = product.name.toLowerCase();
  return PHARMACY_CATEGORY_HINTS.some(hint => nameLower.includes(hint));
}

function pharmacyNameToSlug(pharmacyName: string, stores: Pick<Store, "id" | "slug" | "name">[]): string | undefined {
  const lower = pharmacyName.toLowerCase();

  // Try direct map
  for (const [key, slug] of Object.entries(PHARMACY_SLUG_MAP)) {
    if (lower.includes(key)) return slug;
  }

  // Try store list
  const matched = matchStore(pharmacyName, stores);
  return matched?.slug;
}

interface GoodRxPharmacy {
  name?: string;
  chain?: string;
  address?: string;
  zip?: string;
}

interface GoodRxPrice {
  pharmacy?: GoodRxPharmacy;
  price?: number;
  discounted_price?: number;
  form?: string;
  dosage?: string;
  quantity?: number;
}

interface GoodRxResponse {
  prices?: GoodRxPrice[];
  data?: { prices?: GoodRxPrice[] };
}

export class LiveGoodRxProvider extends BaseProvider {
  readonly id = "live-goodrx";
  readonly name = "GoodRx Prescription Prices";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: true,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  };

  private hasCredentials(): boolean {
    return credentialStore.getCredential(this.id, "api_key") !== null;
  }

  private missingCredentialsMessage(): string {
    return (
      "GoodRx API credentials are not configured. " +
      "Register at https://developer.goodrx.com/ to obtain GOODRX_API_KEY (and optionally GOODRX_CLIENT_ID)."
    );
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    const pharmacyProducts = products.filter(isPharmacyProduct);
    if (pharmacyProducts.length === 0) return this.success([]);

    const apiKey = credentialStore.getCredential(this.id, "api_key")!;
    const clientId = credentialStore.getCredential(this.id, "client_id");

    try {
      const prices: ProviderPriceData[] = [];

      for (const product of pharmacyProducts) {
        const cacheKey = `live-goodrx:prices:${product.slug}`;
        let results = providerCache.get<GoodRxPrice[]>(cacheKey);

        if (!results) {
          results = await this.fetchDrugPrices(product.name, apiKey, clientId);
          providerCache.set(cacheKey, results, CACHE_TTL_MS);
        }

        for (const entry of results) {
          const price = entry.price;
          const discountedPrice = entry.discounted_price;

          if (typeof price !== "number") continue;

          const pharmacyName = entry.pharmacy?.chain ?? entry.pharmacy?.name ?? "";
          const storeSlug = pharmacyNameToSlug(pharmacyName, stores) ?? "pharmacy";

          prices.push({
            productSlug: product.slug,
            storeSlug,
            price,
            salePrice: typeof discountedPrice === "number" && discountedPrice < price ? discountedPrice : null,
            source: this.id,
            confidence: this.getConfidenceSignals().OFFICIAL_API,
            expiresAt: new Date(Date.now() + CACHE_TTL_MS),
          });
        }
      }

      return this.success(prices);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "GoodRx API request failed.");
    }
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    const pharmacyProducts = products.filter(isPharmacyProduct);
    if (pharmacyProducts.length === 0) return this.success([]);

    const apiKey = credentialStore.getCredential(this.id, "api_key")!;
    const clientId = credentialStore.getCredential(this.id, "client_id");

    const cacheKey = `live-goodrx:opportunities:${pharmacyProducts.map(p => p.slug).sort().join(",")}`;
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    try {
      const opportunities: ProviderOpportunityData[] = [];

      for (const product of pharmacyProducts) {
        const searchCacheKey = `live-goodrx:prices:${product.slug}`;
        let results = providerCache.get<GoodRxPrice[]>(searchCacheKey);

        if (!results) {
          results = await this.fetchDrugPrices(product.name, apiKey, clientId);
          providerCache.set(searchCacheKey, results, CACHE_TTL_MS);
        }

        for (const entry of results) {
          const discountedPrice = entry.discounted_price;
          if (typeof discountedPrice !== "number") continue;

          const pharmacyName = entry.pharmacy?.chain ?? entry.pharmacy?.name ?? "pharmacy";
          const storeSlug = pharmacyNameToSlug(pharmacyName, stores);

          const dosageInfo = [entry.dosage, entry.form, entry.quantity ? `qty ${entry.quantity}` : undefined]
            .filter(Boolean)
            .join(", ");

          const title = `GoodRx Price: $${discountedPrice.toFixed(2)} for ${product.name}${dosageInfo ? ` (${dosageInfo})` : ""} at ${pharmacyName}`;

          opportunities.push({
            type: "DIGITAL_COUPON",
            title,
            storeSlug,
            productSlug: product.slug,
            valueType: "SALE_PRICE",
            valueAmount: discountedPrice,
            requiresClipping: true,
            confidenceLevel: "OFFICIAL_API",
            confidence: 0.92,
            expiresAt: new Date(Date.now() + CACHE_TTL_MS),
          });
        }
      }

      providerCache.set(cacheKey, opportunities, CACHE_TTL_MS);
      return this.success(opportunities);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "GoodRx opportunities request failed.");
    }
  }

  private async fetchDrugPrices(
    drugName: string,
    apiKey: string,
    clientId: string | null
  ): Promise<GoodRxPrice[]> {
    const encodedName = encodeURIComponent(drugName);

    // Try RapidAPI endpoint first
    try {
      const rapidApiResponse = await fetch(
        `https://goodrx-public-api.p.rapidapi.com/drugs/${encodedName}/price?zip=10001`,
        {
          headers: {
            "X-RapidAPI-Key": apiKey,
            "X-RapidAPI-Host": "goodrx-public-api.p.rapidapi.com",
            Accept: "application/json",
          },
        }
      );

      if (rapidApiResponse.ok) {
        const data = await rapidApiResponse.json() as GoodRxResponse;
        const prices = data.prices ?? data.data?.prices ?? [];
        if (prices.length > 0) return prices;
      }
    } catch {
      // Fall through to direct API
    }

    // Try direct GoodRx API
    const directHeaders: Record<string, string> = {
      "X-App-Key": apiKey,
      Accept: "application/json",
    };
    if (clientId) directHeaders["X-App-Id"] = clientId;

    const directResponse = await fetch(
      `https://api.goodrx.com/v4/drugs/${encodedName}/prices?zip=10001`,
      { headers: directHeaders }
    );

    if (!directResponse.ok) {
      throw new Error(`GoodRx API responded with ${directResponse.status}.`);
    }

    const data = await directResponse.json() as GoodRxResponse;
    return data.prices ?? data.data?.prices ?? [];
  }
}
