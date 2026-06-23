import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"
import db from "@/lib/db"

// Amazon Product Advertising API (PAAPI 5.0)
// Register at: https://webservices.amazon.com/paapi5/documentation/
// Uses AWS Signature v4 signing (not user OAuth; server-side only)

const PAAPI_ENDPOINT = "https://webservices.amazon.com/paapi5/searchitems";
const MIN_REQUEST_INTERVAL_MS = 1000; // PAAPI: ~1 req/second

// Suppress unused-import warnings for db and providerCache by referencing them
void db;
void providerCache;

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(key: BufferSource, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacBytes(
  key: BufferSource | string,
  message: string
): Promise<ArrayBuffer> {
  const keyData: BufferSource =
    typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function getSigningKey(
  secret: string,
  date: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacBytes(`AWS4${secret}`, date);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, "aws4_request");
}

async function signedPaapiFetch(
  accessKey: string,
  secretKey: string,
  payload: object
): Promise<Response> {
  const region = "us-east-1";
  const service = "ProductAdvertisingAPI";

  const now = new Date();
  const dateString =
    now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateDay = dateString.slice(0, 8);

  const body = JSON.stringify(payload);
  const contentHash = await sha256Hex(body);

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:webservices.amazon.com\n` +
    `x-amz-date:${dateString}\n` +
    `x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems\n`;
  const signedHeaders =
    "content-encoding;content-type;host;x-amz-date;x-amz-target";

  const canonicalRequest = [
    "POST",
    "/paapi5/searchitems",
    "",
    canonicalHeaders,
    signedHeaders,
    contentHash,
  ].join("\n");

  const credentialScope = `${dateDay}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateString,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(secretKey, dateDay, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  const authHeader = [
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return fetch(PAAPI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Encoding": "amz-1.0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Amz-Date": dateString,
      "X-Amz-Target":
        "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
      Authorization: authHeader,
    },
    body,
  });
}

interface PaapiPriceListing {
  Price?: { Amount?: number; DisplayAmount?: string };
  SavingBasis?: { Amount?: number };
  MerchantInfo?: { Name?: string };
}

interface PaapiItem {
  ItemInfo?: {
    Title?: { DisplayValue?: string };
  };
  Offers?: {
    Listings?: PaapiPriceListing[];
  };
}

interface PaapiSearchResponse {
  SearchResult?: {
    Items?: PaapiItem[];
  };
}

function merchantToStoreSlug(merchantName: string | undefined): string {
  if (!merchantName) return "amazon-fresh";
  const lower = merchantName.toLowerCase();
  if (lower.includes("whole foods")) return "whole-foods";
  return "amazon-fresh";
}

export class LiveAmazonPrimeProvider extends BaseProvider {
  readonly id = "live-amazon-prime";
  readonly name = "Amazon Prime Grocery Deals (PAAPI)";
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

  private readonly apiKey: string | null;
  private readonly apiSecret: string | null;
  private lastRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor() {
    super();
    this.apiKey = credentialStore.getCredential(this.id, "api_key");
    this.apiSecret = credentialStore.getCredential(this.id, "client_secret");
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

  private async searchProduct(productName: string): Promise<PaapiItem[]> {
    if (!this.apiKey || !this.apiSecret) return [];

    const partnerTag =
      process.env.AMAZON_PARTNER_TAG ?? "budgetbasket-20";

    const searchPayload = {
      Keywords: productName,
      PartnerTag: partnerTag,
      PartnerType: "Associates",
      Marketplace: "www.amazon.com",
      SearchIndex: "Grocery",
      ItemCount: 5,
      Resources: [
        "Offers.Listings.Price",
        "Offers.Listings.SavingBasis",
        "Offers.Listings.MerchantInfo",
        "ItemInfo.Title",
        "ItemInfo.Features",
        "ItemInfo.ByLineInfo",
      ],
    };

    await this.waitForRateLimit();
    const res = await signedPaapiFetch(this.apiKey, this.apiSecret, searchPayload);
    if (!res.ok) return [];

    const data = await res.json() as PaapiSearchResponse;
    return data.SearchResult?.Items ?? [];
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    if (!this.apiKey || !this.apiSecret) {
      return this.failure(
        "Missing AMAZON_PRIME_API_KEY / AMAZON_PRIME_API_SECRET. " +
          "Register at webservices.amazon.com/paapi5 and join Amazon Associates."
      );
    }

    const prices: ProviderPriceData[] = [];

    for (const product of products) {
      try {
        const cacheKey = `${this.id}:prices:${product.slug}`;
        let cachedItems = providerCache.get<PaapiItem[]>(cacheKey);
        if (!cachedItems) {
          cachedItems = await this.searchProduct(product.normalizedName || product.name);
          providerCache.set(cacheKey, cachedItems, 4 * 60 * 60 * 1000);
        }

        for (const item of cachedItems) {
          const listing = item.Offers?.Listings?.[0];
          if (!listing) continue;

          const price = listing.Price?.Amount;
          if (typeof price !== "number") continue;

          const wasPrice = listing.SavingBasis?.Amount;
          const storeSlug = merchantToStoreSlug(listing.MerchantInfo?.Name);

          prices.push({
            productSlug: product.slug,
            storeSlug,
            price: typeof wasPrice === "number" && wasPrice > price ? wasPrice : price,
            salePrice: typeof wasPrice === "number" && wasPrice > price ? price : null,
            source: this.id,
            confidence: 0.90,
            expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          });
          break; // First listing per product
        }
      } catch {
        continue;
      }
    }

    return this.success(prices);
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.apiKey || !this.apiSecret) {
      return this.failure(
        "Missing AMAZON_PRIME_API_KEY / AMAZON_PRIME_API_SECRET. " +
          "Register at webservices.amazon.com/paapi5 and join Amazon Associates."
      );
    }

    const opportunities: ProviderOpportunityData[] = [];

    for (const product of products) {
      try {
        const cacheKey = `${this.id}:prices:${product.slug}`;
        let cachedItems = providerCache.get<PaapiItem[]>(cacheKey);
        if (!cachedItems) {
          cachedItems = await this.searchProduct(product.name);
          providerCache.set(cacheKey, cachedItems, 4 * 60 * 60 * 1000);
        }

        for (const item of cachedItems) {
          const listing = item.Offers?.Listings?.[0];
          if (!listing) continue;

          const price = listing.Price?.Amount;
          const wasPrice = listing.SavingBasis?.Amount;

          // Only emit an opportunity when there is a demonstrable saving
          if (
            typeof price !== "number" ||
            typeof wasPrice !== "number" ||
            wasPrice <= price
          ) {
            continue;
          }

          const savings = wasPrice - price;
          const storeSlug = merchantToStoreSlug(listing.MerchantInfo?.Name);
          const title = item.ItemInfo?.Title?.DisplayValue ?? product.name;

          opportunities.push({
            type: "STORE_SALE",
            title: `${title} — Prime deal`,
            description: `Was ${wasPrice.toFixed(2)}, now ${price.toFixed(2)} with Prime.`,
            storeSlug,
            productSlug: product.slug,
            providerRef: `${this.id}:${product.slug}`,
            valueType: "FLAT_DISCOUNT",
            valueAmount: savings,
            requiresLoyaltyCard: true, // Prime membership
            requiresAccount: true,
            confidenceLevel: "OFFICIAL_API",
            confidence: 0.90,
            expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          });
          break; // First deal per product
        }
      } catch {
        continue;
      }
    }

    return this.success(opportunities);
  }
}
