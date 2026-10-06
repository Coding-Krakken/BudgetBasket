import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const MIN_REQUEST_INTERVAL_MS = 500;
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

interface WalgreensTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface WalgreensOffer {
  couponId?: string;
  title?: string;
  description?: string;
  discount?: number;
  discountType?: string;
  validTo?: string;
  upcList?: string[];
  couponType?: string;
  requiresClipping?: boolean;
  isDigital?: boolean;
  brand?: string;
}

interface WalgreensOffersResponse {
  offers?: WalgreensOffer[];
}

interface WalgreensProductItem {
  upc?: string;
  name?: string;
  price?: number;
  salePrice?: number;
  regularPrice?: number;
}

interface WalgreensProductResponse {
  products?: WalgreensProductItem[];
  product?: WalgreensProductItem;
}

export class LiveWalgreensApiProvider extends BaseProvider {
  readonly id = "live-walgreens-api";
  readonly name = "Walgreens Digital Offers API";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: true,
    opportunities: true,
    weeklyAds: true,
    inventory: true,
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
      "Walgreens API credentials are not configured. " +
      "Register at https://developer.walgreens.com/ to obtain WALGREENS_CLIENT_ID and WALGREENS_CLIENT_SECRET."
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
        await this.waitForRateLimit();
        const affiliateCode = credentialStore.getCredential(this.id, "api_key") ?? "";
        const params = new URLSearchParams({ term: product.name, ...(affiliateCode && { affiliateCode }) });
        const response = await fetch(
          `https://api.walgreens.com/products/v1/product?${params}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) continue;

        const data = await response.json() as WalgreensProductResponse;
        const item = data.product ?? data.products?.[0];
        if (!item) continue;

        const price = item.regularPrice ?? item.price;
        if (typeof price !== "number") continue;

        prices.push({
          productSlug: product.slug,
          storeSlug: "walgreens",
          price,
          salePrice: typeof item.salePrice === "number" && item.salePrice < price ? item.salePrice : null,
          source: this.id,
          confidence: this.getConfidenceSignals().OFFICIAL_API,
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        });
      }

      return this.success(prices);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Walgreens API request failed.");
    }
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    const cacheKey = "live-walgreens-api:opportunities";
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    try {
      const token = await this.getAccessToken();
      await this.waitForRateLimit();

      const response = await fetch(
        "https://api.walgreens.com/coupons/v1/offers?lat=40.7128&lng=-74.006&storeId=&radius=10",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        return this.failure(`Walgreens offers API responded with ${response.status}.`);
      }

      const data = await response.json() as WalgreensOffersResponse;
      const offers = data.offers ?? [];

      const productsWithNorm = products.map(p => ({ ...p, normalizedName: p.name }));
      const opportunities: ProviderOpportunityData[] = [];

      for (const offer of offers) {
        const title = offer.title ?? offer.brand ?? "Walgreens offer";

        // Try UPC list name matching first, then fall back to title matching
        const matchedByTitle = matchProduct(
          title,
          productsWithNorm as Pick<Product, "id" | "slug" | "name" | "normalizedName">[]
        );
        const productSlug = matchedByTitle?.slug;

        const isDigital = offer.isDigital ?? offer.couponType?.toLowerCase().includes("digital") ?? false;
        const type = isDigital ? "DIGITAL_COUPON" : "STORE_COUPON";

        const discountType = offer.discountType?.toUpperCase() ?? "";
        const valueType = discountType.includes("PERCENT") ? "PERCENT_OFF" : "FLAT_DISCOUNT";

        opportunities.push({
          type,
          title,
          description: offer.description,
          storeSlug: "walgreens",
          productSlug,
          providerRef: offer.couponId,
          valueType,
          valueAmount: offer.discount ?? 0,
          requiresClipping: offer.requiresClipping ?? !isDigital,
          requiresLoyaltyCard: true,
          requiresAccount: isDigital,
          confidenceLevel: "OFFICIAL_API",
          confidence: this.getConfidenceSignals().OFFICIAL_API,
          expiresAt: offer.validTo ? new Date(offer.validTo) : null,
        });
      }

      providerCache.set(cacheKey, opportunities, 4 * 60 * 60 * 1000);
      return this.success(opportunities);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Walgreens opportunities request failed.");
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
    if (!clientId || !clientSecret) throw new Error("Walgreens API credentials are missing.");

    await this.waitForRateLimit();

    const response = await fetch("https://api.walgreens.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });

    if (!response.ok) {
      throw new Error(`Walgreens token request failed with ${response.status}.`);
    }

    const data = await response.json() as WalgreensTokenResponse;
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - TOKEN_TTL_SAFETY_MS,
    };

    return this.token.value;
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
