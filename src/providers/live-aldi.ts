import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { providerCache } from "./cache"

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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

interface AldiItem {
  name?: string;
  title?: string;
  price?: number | string;
  regularPrice?: number | string;
  salePrice?: number | string;
  specialPrice?: number | string;
  validFrom?: string;
  validTo?: string;
  category?: string;
  type?: string;
  description?: string;
}

function parsePrice(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

function extractItemsFromNextData(json: unknown): AldiItem[] {
  if (!json || typeof json !== "object") return [];
  const items: AldiItem[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      // Check if this looks like a product/deal item
      if (typeof obj.name === "string" || typeof obj.title === "string") {
        if (obj.price !== undefined || obj.salePrice !== undefined || obj.specialPrice !== undefined || obj.regularPrice !== undefined) {
          items.push(obj as AldiItem);
        }
      }
      for (const val of Object.values(obj)) walk(val);
    }
  }

  walk(json);
  return items;
}

export class LiveAldiProvider extends BaseProvider {
  readonly id = "live-aldi";
  readonly name = "Aldi Weekly Specials";
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

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    const cacheKey = "live-aldi:prices";
    const cached = providerCache.get<ProviderPriceData[]>(cacheKey);
    if (cached) return this.success(cached);

    const items = await this.fetchAldiItems();
    const prices: ProviderPriceData[] = [];

    for (const item of items) {
      const name = item.name ?? item.title ?? "";
      if (!name) continue;

      const matched = matchProduct(name, products);
      if (!matched) continue;

      const regularPrice = parsePrice(item.regularPrice ?? item.price);
      const salePrice = parsePrice(item.salePrice ?? item.specialPrice);

      if (regularPrice === null && salePrice === null) continue;

      const price = regularPrice ?? salePrice!;
      prices.push({
        productSlug: matched.slug,
        storeSlug: "aldi",
        price,
        salePrice: salePrice !== null && salePrice < price ? salePrice : null,
        source: this.id,
        confidence: 0.80,
        expiresAt: item.validTo ? new Date(item.validTo) : new Date(Date.now() + CACHE_TTL_MS),
      });
    }

    providerCache.set(cacheKey, prices, CACHE_TTL_MS);
    return this.success(prices);
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const cacheKey = "live-aldi:opportunities";
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    const items = await this.fetchAldiItems();
    const opportunities: ProviderOpportunityData[] = [];

    const productsWithNorm = products.map(p => ({ ...p, normalizedName: p.name }));

    for (const item of items) {
      const name = item.name ?? item.title ?? "";
      if (!name) continue;

      const regularPrice = parsePrice(item.regularPrice ?? item.price);
      const salePrice = parsePrice(item.salePrice ?? item.specialPrice);

      const isAldiFinds = item.category?.toLowerCase().includes("find") ||
        item.type?.toLowerCase().includes("find") ||
        item.category?.toLowerCase().includes("clearance");

      const type = isAldiFinds ? "CLEARANCE" : "WEEKLY_AD_DEAL";

      const matched = matchProduct(name, productsWithNorm as Pick<Product, "id" | "slug" | "name" | "normalizedName">[]);
      const productSlug = matched?.slug;

      const basePrice = regularPrice ?? (salePrice !== null ? salePrice * 1.2 : null);
      const effectivePrice = salePrice ?? regularPrice;

      if (effectivePrice === null) continue;

      const wasPrice = basePrice !== effectivePrice ? basePrice : null;
      const savings = wasPrice !== null && wasPrice > effectivePrice ? wasPrice - effectivePrice : null;

      opportunities.push({
        type,
        title: name,
        description: item.description,
        storeSlug: "aldi",
        productSlug,
        valueType: "SALE_PRICE",
        valueAmount: effectivePrice,
        confidenceLevel: "WEEKLY_AD",
        confidence: 0.80,
        startsAt: item.validFrom ? new Date(item.validFrom) : null,
        expiresAt: item.validTo ? new Date(item.validTo) : null,
        weeklyAd: {
          salePrice: salePrice,
          wasPrice: wasPrice,
          savings: savings,
          validFrom: item.validFrom ? new Date(item.validFrom) : null,
          validTo: item.validTo ? new Date(item.validTo) : null,
        },
      });
    }

    providerCache.set(cacheKey, opportunities, CACHE_TTL_MS);
    return this.success(opportunities);
  }

  private async fetchAldiItems(): Promise<AldiItem[]> {
    // Attempt 1: Parse ALDI weekly specials page for __NEXT_DATA__
    try {
      const response = await fetch("https://www.aldi.us/en/weekly-specials/", {
        headers: {
          "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
          "Accept": "text/html",
        },
      });

      if (response.ok) {
        const html = await response.text();
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (match?.[1]) {
          const nextData = JSON.parse(match[1]);
          const items = extractItemsFromNextData(nextData);
          if (items.length > 0) return items;
        }
      }
    } catch {
      // Fall through to next attempt
    }

    // Attempt 2: ALDI specials JSON feed
    const feedUrls = [
      "https://www.aldi.us/api/specials",
      "https://www.aldi.us/en/weekly-specials/specials-feed.json",
    ];

    for (const url of feedUrls) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
            "Accept": "application/json",
          },
        });

        if (response.ok) {
          const json = await response.json() as unknown;
          const items = extractItemsFromNextData(json);
          if (items.length > 0) return items;
        }
      } catch {
        // Fall through
      }
    }

    return [];
  }
}
