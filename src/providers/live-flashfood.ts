import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

interface FlashfoodItem {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  original_price?: number | string;
  sale_price?: number | string;
  price?: number | string;
  discount_price?: number | string;
  store_name?: string;
  store?: { name?: string; chain?: string };
  best_before?: string;
  expiry?: string;
  expires_at?: string;
  category?: string;
  type?: string;
}

function parsePrice(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

function extractFlashfoodItems(json: unknown): FlashfoodItem[] {
  if (!json || typeof json !== "object") return [];
  const items: FlashfoodItem[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.name === "string" || typeof obj.title === "string") {
        if (
          obj.sale_price !== undefined ||
          obj.discount_price !== undefined ||
          obj.best_before !== undefined ||
          obj.expiry !== undefined
        ) {
          items.push(obj as FlashfoodItem);
        }
      }
      for (const val of Object.values(obj)) walk(val);
    }
  }

  walk(json);
  return items;
}

function deriveStoreSlug(storeName: string | undefined, stores: Pick<Store, "id" | "slug" | "name">[]): string | undefined {
  if (!storeName) return undefined;
  const matched = matchStore(storeName, stores);
  return matched?.slug;
}

export class LiveFlashfoodProvider extends BaseProvider {
  readonly id = "live-flashfood";
  readonly name = "Flashfood Markdown Deals";
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

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    const cacheKey = "live-flashfood:prices";
    const cached = providerCache.get<ProviderPriceData[]>(cacheKey);
    if (cached) return this.success(cached);

    const result = await this.fetchFlashfoodItems(stores);
    if (!result.ok) return this.failure(result.error);

    const prices: ProviderPriceData[] = [];

    for (const item of result.items) {
      const name = item.name ?? item.title ?? "";
      if (!name) continue;

      const matched = matchProduct(name, products);
      if (!matched) continue;

      const salePrice = parsePrice(item.sale_price ?? item.discount_price ?? item.price);
      const originalPrice = parsePrice(item.original_price);

      if (salePrice === null) continue;

      const storeSlug = deriveStoreSlug(
        item.store_name ?? item.store?.name ?? item.store?.chain,
        stores
      );

      const expiry = item.best_before ?? item.expiry ?? item.expires_at;

      prices.push({
        productSlug: matched.slug,
        storeSlug: storeSlug ?? "flashfood",
        price: originalPrice ?? salePrice,
        salePrice: originalPrice !== null && originalPrice > salePrice ? salePrice : null,
        source: this.id,
        confidence: 0.75,
        expiresAt: expiry ? new Date(expiry) : null,
      });
    }

    providerCache.set(cacheKey, prices, CACHE_TTL_MS);
    return this.success(prices);
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const cacheKey = "live-flashfood:opportunities";
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    const result = await this.fetchFlashfoodItems(stores);
    if (!result.ok) return this.failure(result.error);

    const opportunities: ProviderOpportunityData[] = [];
    const productsWithNorm = products.map(p => ({ ...p, normalizedName: p.name }));

    for (const item of result.items) {
      const name = item.name ?? item.title ?? "";
      if (!name) continue;

      const salePrice = parsePrice(item.sale_price ?? item.discount_price ?? item.price);
      if (salePrice === null) continue;

      const storeSlug = deriveStoreSlug(
        item.store_name ?? item.store?.name ?? item.store?.chain,
        stores
      );

      const matched = matchProduct(
        name,
        productsWithNorm as Pick<Product, "id" | "slug" | "name" | "normalizedName">[]
      );

      const expiry = item.best_before ?? item.expiry ?? item.expires_at;

      const isClearance = item.category?.toLowerCase().includes("clearance") ||
        item.type?.toLowerCase().includes("clearance");

      opportunities.push({
        type: isClearance ? "CLEARANCE" : "MANAGER_SPECIAL",
        title: name,
        description: item.description,
        storeSlug: storeSlug ?? "flashfood",
        productSlug: matched?.slug,
        valueType: "SALE_PRICE",
        valueAmount: salePrice,
        confidenceLevel: "PUBLIC_PAGE",
        confidence: 0.75,
        expiresAt: expiry ? new Date(expiry) : null,
      });
    }

    providerCache.set(cacheKey, opportunities, CACHE_TTL_MS);
    return this.success(opportunities);
  }

  private async fetchFlashfoodItems(
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<{ ok: true; items: FlashfoodItem[] } | { ok: false; error: string }> {
    const apiKey = credentialStore.getCredential(this.id, "api_key");
    const baseHeaders: Record<string, string> = {
      "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
    };
    if (apiKey) baseHeaders["Authorization"] = `Bearer ${apiKey}`;

    const endpoints = [
      "https://api.flashfood.com/v1/items?lat=40.7128&lng=-74.006&radius=50",
      "https://www.flashfood.com/api/v1/items?postal_code=10001",
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            ...baseHeaders,
            "Accept": "application/json",
          },
        });

        if (response.status === 401 || response.status === 403) {
          return {
            ok: false,
            error: "Flashfood API not accessible. Requires app account at flashfood.com",
          };
        }

        if (response.ok) {
          const json = await response.json() as unknown;
          const items = extractFlashfoodItems(json);
          if (items.length > 0) return { ok: true, items };
        }
      } catch {
        // Try next endpoint
      }
    }

    // Attempt: parse flashfood.com homepage for __NEXT_DATA__
    try {
      const response = await fetch("https://www.flashfood.com/", {
        headers: {
          ...baseHeaders,
          "Accept": "text/html",
        },
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: "Flashfood API not accessible. Requires app account at flashfood.com",
        };
      }

      if (response.ok) {
        const html = await response.text();
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (match?.[1]) {
          const nextData = JSON.parse(match[1]);
          const items = extractFlashfoodItems(nextData);
          if (items.length > 0) return { ok: true, items };
        }
      }
    } catch {
      // Fall through
    }

    return {
      ok: false,
      error: "Flashfood API not accessible. Requires app account at flashfood.com",
    };
  }
}
