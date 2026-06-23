import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const MIN_REQUEST_INTERVAL_MS = 1000;
const TOKEN_TTL_SAFETY_MS = 60_000;

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

interface WalmartTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

interface WalmartItemPrice {
  currentPrice?: number;
  wasPrice?: number;
  currentPriceType?: string;
}

interface WalmartItem {
  itemId?: string;
  name?: string;
  shortDescription?: string;
  price?: WalmartItemPrice;
  rollback?: boolean;
  specialBuy?: boolean;
  clearance?: boolean;
}

interface WalmartSearchResponse {
  items?: WalmartItem[];
  list?: WalmartItem[];
  products?: WalmartItem[];
}

export class LiveWalmartApiProvider extends BaseProvider {
  readonly id = "live-walmart-api";
  readonly name = "Walmart Developer API";
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

  private token: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  private hasCredentials(): boolean {
    return (
      credentialStore.getCredential(this.id, "client_id") !== null &&
      credentialStore.getCredential(this.id, "client_secret") !== null
    );
  }

  private missingCredentialsMessage(): string {
    return (
      "Walmart API credentials are not configured. " +
      "Register at https://developer.walmart.com/ to obtain WALMART_CLIENT_ID and WALMART_CLIENT_SECRET."
    );
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    try {
      const token = await this.getAccessToken();
      const prices: ProviderPriceData[] = [];

      for (const product of products) {
        const items = await this.searchProducts(token, product.name);

        for (const item of items) {
          const currentPrice = item.price?.currentPrice;
          const wasPrice = item.price?.wasPrice;

          if (typeof currentPrice !== "number") continue;

          prices.push({
            productSlug: product.slug,
            storeSlug: "walmart",
            price: wasPrice ?? currentPrice,
            salePrice: wasPrice !== undefined && currentPrice < wasPrice ? currentPrice : null,
            source: this.id,
            confidence: this.getConfidenceSignals().OFFICIAL_API,
            expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          });

          break; // Use first result per product
        }
      }

      return this.success(prices);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Walmart API request failed.");
    }
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    const cacheKey = `live-walmart-api:opportunities:${products.map(p => p.slug).sort().join(",")}`;
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    try {
      const token = await this.getAccessToken();
      const opportunities: ProviderOpportunityData[] = [];

      for (const product of products) {
        const items = await this.searchProducts(token, product.name);

        for (const item of items) {
          if (!item.rollback && !item.specialBuy) continue;

          const currentPrice = item.price?.currentPrice;
          const wasPrice = item.price?.wasPrice;

          if (typeof currentPrice !== "number") continue;

          opportunities.push({
            type: "STORE_SALE",
            title: item.name ?? product.name,
            description: item.shortDescription,
            storeSlug: "walmart",
            productSlug: product.slug,
            providerRef: item.itemId,
            valueType: "SALE_PRICE",
            valueAmount: currentPrice,
            confidenceLevel: "OFFICIAL_API",
            confidence: this.getConfidenceSignals().OFFICIAL_API,
            expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          });

          break; // One opportunity per product
        }
      }

      providerCache.set(cacheKey, opportunities, 4 * 60 * 60 * 1000);
      return this.success(opportunities);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Walmart opportunities request failed.");
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }

    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.fetchAccessToken().finally(() => {
      this.tokenRequest = null;
    });

    return this.tokenRequest;
  }

  private async fetchAccessToken(): Promise<string> {
    const clientId = credentialStore.getCredential(this.id, "client_id");
    const clientSecret = credentialStore.getCredential(this.id, "client_secret");
    if (!clientId || !clientSecret) throw new Error("Walmart API credentials are missing.");

    await this.waitForRateLimit();

    const correlationId = crypto.randomUUID();
    const response = await fetch("https://marketplace.walmartapis.com/v3/token", {
      method: "POST",
      headers: {
        "WM_SVC.NAME": "BudgetBasket",
        "WM_QOS.CORRELATION_ID": correlationId,
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });

    if (!response.ok) {
      throw new Error(`Walmart token request failed with ${response.status}.`);
    }

    const data = await response.json() as WalmartTokenResponse;
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 900) * 1000 - TOKEN_TTL_SAFETY_MS,
    };

    return this.token.value;
  }

  private async searchProducts(token: string, query: string): Promise<WalmartItem[]> {
    await this.waitForRateLimit();

    const correlationId = crypto.randomUUID();
    const params = new URLSearchParams({ query, numItems: "10" });

    const response = await fetch(
      `https://marketplace.walmartapis.com/v3/items/walmart/search?${params}`,
      {
        headers: {
          "WM_SEC.ACCESS_TOKEN": token,
          "WM_SVC.NAME": "BudgetBasket",
          "WM_QOS.CORRELATION_ID": correlationId,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Walmart search request failed with ${response.status}.`);
    }

    const data = await response.json() as WalmartSearchResponse;
    return data.items ?? data.list ?? data.products ?? [];
  }

  private async waitForRateLimit(): Promise<void> {
    const scheduledRequest = this.requestQueue.then(async () => {
      const waitMs = this.lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
      this.lastRequestAt = Date.now();
    });

    this.requestQueue = scheduledRequest.catch(() => undefined);
    await scheduledRequest;
  }
}
