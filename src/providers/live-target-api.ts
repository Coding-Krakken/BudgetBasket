import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const MIN_REQUEST_INTERVAL_MS = 500;

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

interface TargetItemPrice {
  current_retail?: number;
  reg_retail?: number;
  formatted_current_price?: string;
}

interface TargetItemPromotion {
  promotion_id?: string;
  type?: string;
  title?: string;
  description?: string;
  price?: number;
  percent_off?: number;
  circle_offer?: boolean;
  expires_at?: string;
  starts_at?: string;
}

interface TargetSearchItem {
  tcin?: string;
  title?: string;
  item?: {
    description?: string;
    enrichment?: { title?: string };
  };
  price?: TargetItemPrice;
  promotions?: TargetItemPromotion[];
}

interface TargetSearchResponse {
  data?: {
    search?: {
      products?: TargetSearchItem[];
    };
    products?: TargetSearchItem[];
  };
  products?: TargetSearchItem[];
}

interface TargetDeal {
  deal_id?: string;
  title?: string;
  description?: string;
  price?: number;
  percent_off?: number;
  deal_type?: string;
  circle_offer?: boolean;
  tcin?: string;
  expires_at?: string;
  starts_at?: string;
}

interface TargetDealsResponse {
  deals?: TargetDeal[];
  data?: { deals?: TargetDeal[] };
}

export class LiveTargetApiProvider extends BaseProvider {
  readonly id = "live-target-api";
  readonly name = "Target RedSky & Partner API";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: true,
    opportunities: true,
    weeklyAds: true,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  };

  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  private hasCredentials(): boolean {
    return credentialStore.getCredential(this.id, "api_key") !== null;
  }

  private missingCredentialsMessage(): string {
    return (
      "Target API credentials are not configured. " +
      "Register at https://developers.target.com/ to obtain TARGET_API_KEY."
    );
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    const apiKey = credentialStore.getCredential(this.id, "api_key")!;

    try {
      const prices: ProviderPriceData[] = [];

      for (const product of products) {
        const items = await this.searchProducts(apiKey, product.normalizedName || product.name);

        for (const item of items) {
          const currentRetail = item.price?.current_retail;
          const regRetail = item.price?.reg_retail;

          if (typeof currentRetail !== "number" && typeof regRetail !== "number") continue;

          const basePrice = regRetail ?? currentRetail!;
          const salePrice =
            typeof currentRetail === "number" &&
            typeof regRetail === "number" &&
            currentRetail < regRetail
              ? currentRetail
              : null;

          prices.push({
            productSlug: product.slug,
            storeSlug: "target",
            price: basePrice,
            salePrice,
            source: this.id,
            confidence: this.getConfidenceSignals().OFFICIAL_API,
            expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          });

          break; // Use first result per product
        }
      }

      return this.success(prices);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Target API request failed.");
    }
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.hasCredentials()) {
      return this.failure(this.missingCredentialsMessage());
    }

    const apiKey = credentialStore.getCredential(this.id, "api_key")!;

    const cacheKey = `live-target-api:opportunities:${products.map(p => p.slug).sort().join(",")}`;
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    try {
      const opportunities: ProviderOpportunityData[] = [];
      const productsWithNorm = products.map(p => ({ ...p, normalizedName: p.name }));

      // Fetch window deals (weekly sales and circle offers)
      const deals = await this.fetchWindowDeals(apiKey);
      for (const deal of deals) {
        const title = deal.title ?? "Target deal";
        const matched = matchProduct(
          title,
          productsWithNorm as Pick<Product, "id" | "slug" | "name" | "normalizedName">[]
        );

        const isCircle = deal.circle_offer ?? deal.deal_type?.toLowerCase().includes("circle") ?? false;
        const type = isCircle ? "DIGITAL_COUPON" : "STORE_SALE";

        const hasPercentOff = typeof deal.percent_off === "number" && deal.percent_off > 0;
        const hasFixedPrice = typeof deal.price === "number";

        if (!hasPercentOff && !hasFixedPrice) continue;

        opportunities.push({
          type,
          title,
          description: deal.description,
          storeSlug: "target",
          productSlug: matched?.slug,
          providerRef: deal.deal_id,
          valueType: hasPercentOff ? "PERCENT_OFF" : "SALE_PRICE",
          valueAmount: deal.price ?? 0,
          valuePercent: deal.percent_off,
          requiresLoyaltyCard: isCircle,
          requiresAccount: isCircle,
          confidenceLevel: "OFFICIAL_API",
          confidence: this.getConfidenceSignals().OFFICIAL_API,
          startsAt: deal.starts_at ? new Date(deal.starts_at) : null,
          expiresAt: deal.expires_at ? new Date(deal.expires_at) : null,
        });
      }

      // Also fetch product-level promotions for the requested products
      for (const product of products) {
        const items = await this.searchProducts(apiKey, product.name);

        for (const item of items) {
          for (const promo of item.promotions ?? []) {
            const isCircle = promo.circle_offer ?? promo.type?.toLowerCase().includes("circle") ?? false;
            const type = isCircle ? "DIGITAL_COUPON" : "STORE_SALE";

            const hasPercentOff = typeof promo.percent_off === "number" && promo.percent_off > 0;
            const hasFixedPrice = typeof promo.price === "number";

            if (!hasPercentOff && !hasFixedPrice) continue;

            opportunities.push({
              type,
              title: promo.title ?? item.title ?? product.name,
              description: promo.description,
              storeSlug: "target",
              productSlug: product.slug,
              providerRef: promo.promotion_id,
              valueType: hasPercentOff ? "PERCENT_OFF" : "SALE_PRICE",
              valueAmount: promo.price ?? 0,
              valuePercent: promo.percent_off,
              requiresLoyaltyCard: isCircle,
              requiresAccount: isCircle,
              confidenceLevel: "OFFICIAL_API",
              confidence: this.getConfidenceSignals().OFFICIAL_API,
              expiresAt: promo.expires_at ? new Date(promo.expires_at) : null,
              startsAt: promo.starts_at ? new Date(promo.starts_at) : null,
            });
          }
          break; // First result per product
        }
      }

      providerCache.set(cacheKey, opportunities, 4 * 60 * 60 * 1000);
      return this.success(opportunities);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Target opportunities request failed.");
    }
  }

  private async searchProducts(apiKey: string, query: string): Promise<TargetSearchItem[]> {
    await this.waitForRateLimit();

    const params = new URLSearchParams({
      key: apiKey,
      keyword: query,
      count: "24",
      offset: "0",
      channel: "WEB",
      isPipEnabled: "true",
    });

    const response = await fetch(
      `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?${params}`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) {
      throw new Error(`Target search request failed with ${response.status}.`);
    }

    const data = await response.json() as TargetSearchResponse;
    return (
      data.data?.search?.products ??
      data.data?.products ??
      data.products ??
      []
    );
  }

  private async fetchWindowDeals(apiKey: string): Promise<TargetDeal[]> {
    await this.waitForRateLimit();

    const params = new URLSearchParams({ key: apiKey, pageCount: "72", pageNumber: "0" });

    try {
      const response = await fetch(
        `https://r2d2.target.com/ggc/deals/v1/window_deals?${params}`,
        { headers: { Accept: "application/json" } }
      );

      if (!response.ok) return [];

      const data = await response.json() as TargetDealsResponse;
      return data.deals ?? data.data?.deals ?? [];
    } catch {
      return [];
    }
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
