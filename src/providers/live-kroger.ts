import type { ProviderCapability, ProviderFetchResult, ProviderHealth } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { CredentialStore } from "./credential-store";
import { credentialStore } from "./credential-store";
import type { Product, Store } from "@prisma/client";

interface KrogerTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface KrogerProductItem {
  productId?: string;
  upc?: string;
  description?: string;
  brand?: string;
  items?: Array<{
    price?: {
      regular?: number;
      promo?: number;
    };
    size?: string;
    soldBy?: string;
  }>;
  coupons?: KrogerOffer[];
  couponOffers?: KrogerOffer[];
  offers?: KrogerOffer[];
  promotions?: KrogerOffer[];
}

interface KrogerOffer {
  id?: string;
  offerId?: string;
  type?: string;
  title?: string;
  description?: string;
  shortDescription?: string;
  value?: number;
  valueAmount?: number;
  valuePercent?: number;
  amountOff?: number;
  minimumQuantity?: number;
  expirationDate?: string;
  expiresAt?: string;
  endDate?: string;
  isDigital?: boolean;
  requiresClip?: boolean;
}

interface KrogerProductResponse {
  data?: KrogerProductItem[];
}

const REQUIRED_CREDENTIALS = ["client_id", "client_secret"] as const;
const PRODUCT_SCOPE = "product.compact";
const TOKEN_TTL_SAFETY_MS = 60_000;
const MIN_REQUEST_INTERVAL_MS = 1_000;

export class LiveKrogerProvider extends BaseProvider {
  readonly id = "live-kroger-api";
  readonly name = "Kroger API (Official)";
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

  private token: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();
  private productCache = new Map<string, KrogerProductItem | null>();
  private productRequests = new Map<string, Promise<KrogerProductItem | null>>();

  constructor(
    private readonly credentials: CredentialStore = credentialStore,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    super();
  }

  hasRequiredCredentials() {
    return this.credentials.hasCredentials(this.id, REQUIRED_CREDENTIALS);
  }

  getMissingCredentials() {
    return this.credentials.missingCredentials(this.id, REQUIRED_CREDENTIALS);
  }

  override getHealth(): ProviderHealth {
    const missingCredentials = this.getMissingCredentials();

    return {
      providerId: this.id,
      providerName: this.name,
      type: this.type,
      status: missingCredentials.length === 0 ? "PENDING" : "OFFLINE",
      lastSyncAt: null,
      lastSuccessAt: null,
      freshnessMinutes: null,
      itemCount: 0,
      capabilities: this.capabilities,
      isDemo: this.isDemo,
    };
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    if (!this.hasRequiredCredentials()) {
      return this.failure("Kroger API credentials are not configured; seed provider fallback remains active.");
    }

    const locationId = this.resolveLocationId(stores);
    if (!locationId) {
      return this.failure("KROGER_DEFAULT_LOCATION_ID is required for live Kroger price lookup.");
    }

    try {
      const prices: ProviderPriceData[] = [];

      for (const product of products) {
        const item = await this.findProduct(product, locationId);
        const price = item?.items?.[0]?.price;
        const regular = price?.regular;

        if (!item || typeof regular !== "number") continue;

        const promo = price?.promo;
        prices.push({
          productSlug: product.slug,
          storeSlug: "kroger",
          price: regular,
          salePrice: typeof promo === "number" && promo < regular ? promo : null,
          unit: item.items?.[0]?.size,
          source: this.id,
          confidence: this.getConfidenceSignals().OFFICIAL_API,
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        });
      }

      return this.success(prices);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Kroger API request failed.");
    }
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.hasRequiredCredentials()) {
      return this.failure("Kroger API credentials are not configured; seed provider fallback remains active.");
    }

    const locationId = this.resolveLocationId(stores);
    if (!locationId) {
      return this.failure("KROGER_DEFAULT_LOCATION_ID is required for live Kroger opportunity lookup.");
    }

    try {
      const opportunities: ProviderOpportunityData[] = [];

      for (const product of products) {
        const item = await this.findProduct(
          { ...product, normalizedName: product.name },
          locationId
        );
        if (!item) continue;

        opportunities.push(...this.mapProductOffers(product.slug, item));
      }

      return this.success(opportunities);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : "Kroger opportunity request failed.");
    }
  }

  private resolveLocationId(stores: Pick<Store, "id" | "slug" | "name">[]) {
    const krogerStore = stores.find(store => store.slug === "kroger");
    return process.env.KROGER_DEFAULT_LOCATION_ID || krogerStore?.id || null;
  }

  private async getAccessToken() {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }

    if (this.tokenRequest) {
      return this.tokenRequest;
    }

    this.tokenRequest = this.fetchAccessToken().finally(() => {
      this.tokenRequest = null;
    });

    return this.tokenRequest;
  }

  private async fetchAccessToken() {
    const clientId = this.credentials.getCredential(this.id, "client_id");
    const clientSecret = this.credentials.getCredential(this.id, "client_secret");
    if (!clientId || !clientSecret) throw new Error("Kroger API credentials are missing.");

    await this.waitForRateLimit();

    const response = await this.fetchImpl("https://api.kroger.com/v1/connect/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: PRODUCT_SCOPE }),
    });

    if (!response.ok) {
      throw new Error(`Kroger token request failed with ${response.status}.`);
    }

    const data = (await response.json()) as KrogerTokenResponse;
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 1800) * 1000 - TOKEN_TTL_SAFETY_MS,
    };

    return this.token.value;
  }

  private async findProduct(
    product: Pick<Product, "slug" | "name" | "normalizedName">,
    locationId: string
  ): Promise<KrogerProductItem | null> {
    const cacheKey = `${locationId}:${product.slug}`;
    if (this.productCache.has(cacheKey)) {
      return this.productCache.get(cacheKey) ?? null;
    }

    const existingRequest = this.productRequests.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this.loadProduct(product, locationId, cacheKey).finally(() => {
      this.productRequests.delete(cacheKey);
    });
    this.productRequests.set(cacheKey, request);
    return request;
  }

  private async loadProduct(
    product: Pick<Product, "slug" | "name" | "normalizedName">,
    locationId: string,
    cacheKey: string
  ) {
    const token = await this.getAccessToken();
    const productResult = await this.searchProducts(token, product.normalizedName || product.name, locationId);
    const item = productResult.data?.[0] ?? null;
    this.productCache.set(cacheKey, item);
    return item;
  }

  private async searchProducts(token: string, term: string, locationId: string) {
    await this.waitForRateLimit();

    const params = new URLSearchParams({
      "filter.term": term,
      "filter.locationId": locationId,
      "filter.limit": "1",
    });

    const response = await this.fetchImpl(`https://api.kroger.com/v1/products?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Kroger product request failed with ${response.status}.`);
    }

    return (await response.json()) as KrogerProductResponse;
  }

  private mapProductOffers(productSlug: string, item: KrogerProductItem): ProviderOpportunityData[] {
    const explicitOffers = [
      ...(item.coupons ?? []),
      ...(item.couponOffers ?? []),
      ...(item.offers ?? []),
      ...(item.promotions ?? []),
    ];

    const mappedOffers = explicitOffers
      .map(offer => this.mapKrogerOffer(productSlug, offer))
      .filter((offer): offer is ProviderOpportunityData => Boolean(offer));

    const price = item.items?.[0]?.price;
    if (typeof price?.regular === "number" && typeof price.promo === "number" && price.promo < price.regular) {
      mappedOffers.push({
        type: "STORE_SALE",
        title: `${item.description ?? "Kroger item"} sale price`,
        description: `Kroger promotional shelf price: $${price.promo.toFixed(2)} was $${price.regular.toFixed(2)}.`,
        storeSlug: "kroger",
        productSlug,
        valueType: "SALE_PRICE",
        valueAmount: price.promo,
        stackability: "STACKABLE_WITH_MFG",
        requiresLoyaltyCard: true,
        confidenceLevel: "OFFICIAL_API",
        confidence: this.getConfidenceSignals().OFFICIAL_API,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        isFeatured: true,
        termsAndConditions: "Live Kroger promotional price; verify in cart or at checkout.",
      });
    }

    return mappedOffers;
  }

  private mapKrogerOffer(productSlug: string, offer: KrogerOffer): ProviderOpportunityData | null {
    const valueAmount = offer.valueAmount ?? offer.value ?? offer.amountOff;
    const valuePercent = offer.valuePercent;

    if (typeof valueAmount !== "number" && typeof valuePercent !== "number") {
      return null;
    }

    const title = offer.title ?? offer.shortDescription ?? offer.description ?? "Kroger digital coupon";
    const expiresAt = offer.expirationDate ?? offer.expiresAt ?? offer.endDate;

    return {
      type: offer.type?.toUpperCase().includes("LOYALTY") ? "LOYALTY_OFFER" : "DIGITAL_COUPON",
      title,
      description: offer.description ?? title,
      storeSlug: "kroger",
      productSlug,
      valueType: typeof valuePercent === "number" ? "PERCENT_OFF" : "FIXED_OFF",
      valueAmount: typeof valueAmount === "number" ? valueAmount : 0,
      valuePercent,
      minimumQuantity: offer.minimumQuantity ?? 1,
      stackability: "STACKABLE_WITH_MFG",
      isMfgCoupon: false,
      requiresClipping: offer.requiresClip ?? offer.isDigital ?? true,
      requiresLoyaltyCard: true,
      requiresAccount: true,
      confidenceLevel: "OFFICIAL_API",
      confidence: this.getConfidenceSignals().OFFICIAL_API,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isFeatured: true,
      termsAndConditions: offer.id ?? offer.offerId ? `Kroger offer reference: ${offer.id ?? offer.offerId}` : undefined,
    };
  }

  private async waitForRateLimit() {
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
