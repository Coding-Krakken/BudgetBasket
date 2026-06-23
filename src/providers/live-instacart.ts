import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

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

interface InstacartProduct {
  product_id?: string;
  name?: string;
  size?: string;
  price_cents?: number;
  discounted_price_cents?: number;
  retailer_key?: string;
  available?: boolean;
}

interface InstacartSearchResponse {
  products?: InstacartProduct[];
  items?: InstacartProduct[];
  data?: { products?: InstacartProduct[] };
}

function retailerKeyToSlug(retailerKey: string | undefined): string {
  if (!retailerKey) return "instacart";
  // Strip common suffixes like "_us", "_ca", etc.
  return retailerKey.replace(/_us$/, "").replace(/_ca$/, "").replace(/_\w{2}$/, "").replace(/_/g, "-");
}

export class LiveInstacartProvider extends BaseProvider {
  readonly id = "live-instacart";
  readonly name = "Instacart Connect";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: true,
    opportunities: true,
    weeklyAds: false,
    inventory: true,
    cartIntegration: true,
    receiptValidation: false,
  };

  private hasCredentials(): boolean {
    return credentialStore.getCredential(this.id, "api_key") !== null;
  }

  private missingCredentialsMessage(): string {
    return (
      "Instacart Connect credentials are not configured. " +
      "Register at https://www.instacart.com/business/developer to obtain INSTACART_API_KEY."
    );
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    const apiKey = credentialStore.getCredential(this.id, "api_key")!;

    try {
      const prices: ProviderPriceData[] = [];

      for (const product of products) {
        const cacheKey = `live-instacart:search:${product.slug}`;
        let results = providerCache.get<InstacartProduct[]>(cacheKey);

        if (!results) {
          results = await this.searchProducts(apiKey, product.name);
          providerCache.set(cacheKey, results, CACHE_TTL_MS);
        }

        for (const item of results) {
          if (!item.available && item.available !== undefined) continue;

          const priceCents = item.price_cents;
          const discountedCents = item.discounted_price_cents;

          if (typeof priceCents !== "number") continue;

          const price = priceCents / 100;
          const salePrice =
            typeof discountedCents === "number" && discountedCents < priceCents
              ? discountedCents / 100
              : null;

          const storeSlug = retailerKeyToSlug(item.retailer_key);

          // Verify the store is relevant if we have a store list
          if (stores.length > 0) {
            const storeMatch = matchStore(storeSlug, stores) ?? matchStore(item.retailer_key ?? "", stores);
            if (!storeMatch) continue;
          }

          prices.push({
            productSlug: product.slug,
            storeSlug,
            price,
            salePrice,
            unit: item.size,
            source: this.id,
            confidence: this.getConfidenceSignals().OFFICIAL_API * 0.97, // 0.92
            expiresAt: new Date(Date.now() + CACHE_TTL_MS),
          });
        }
      }

      return this.success(prices);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Instacart API request failed.");
    }
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    const apiKey = credentialStore.getCredential(this.id, "api_key")!;

    const cacheKey = `live-instacart:opportunities:${products.map(p => p.slug).sort().join(",")}`;
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    try {
      const opportunities: ProviderOpportunityData[] = [];

      for (const product of products) {
        const searchCacheKey = `live-instacart:search:${product.slug}`;
        let results = providerCache.get<InstacartProduct[]>(searchCacheKey);

        if (!results) {
          results = await this.searchProducts(apiKey, product.name);
          providerCache.set(searchCacheKey, results, CACHE_TTL_MS);
        }

        for (const item of results) {
          const priceCents = item.price_cents;
          const discountedCents = item.discounted_price_cents;

          if (typeof priceCents !== "number" || typeof discountedCents !== "number") continue;
          if (discountedCents >= priceCents) continue;

          const storeSlug = retailerKeyToSlug(item.retailer_key);

          if (stores.length > 0) {
            const storeMatch = matchStore(storeSlug, stores) ?? matchStore(item.retailer_key ?? "", stores);
            if (!storeMatch) continue;
          }

          opportunities.push({
            type: "STORE_SALE",
            title: item.name ?? product.name,
            storeSlug,
            productSlug: product.slug,
            providerRef: item.product_id,
            valueType: "SALE_PRICE",
            valueAmount: discountedCents / 100,
            confidenceLevel: "OFFICIAL_API",
            confidence: 0.92,
            expiresAt: new Date(Date.now() + CACHE_TTL_MS),
          });
        }
      }

      providerCache.set(cacheKey, opportunities, CACHE_TTL_MS);
      return this.success(opportunities);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Instacart opportunities request failed.");
    }
  }

  private async searchProducts(apiKey: string, query: string): Promise<InstacartProduct[]> {
    const params = new URLSearchParams({ query, retailer_keys: "all" });
    const response = await fetch(
      `https://connect.instacart.com/idp/v1/products/search?${params}`,
      {
        headers: {
          Authorization: `InstacartMerchant ${apiKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Instacart search request failed with ${response.status}.`);
    }

    const data = await response.json() as InstacartSearchResponse;
    return data.products ?? data.items ?? data.data?.products ?? [];
  }
}
