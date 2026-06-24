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

interface SamsPrice {
  finalPrice?: { amount?: number };
  listPrice?: { amount?: number };
  currentPrice?: number;
  wasPrice?: number;
}

interface SamsItem {
  name?: string;
  title?: string;
  itemNumber?: string;
  price?: SamsPrice;
  savingsFlag?: boolean;
  instantSavings?: number | string;
  savings?: number | string;
  description?: string;
  imageUrl?: string;
}

function parsePrice(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

function extractSamsItems(json: unknown): SamsItem[] {
  if (!json || typeof json !== "object") return [];
  const items: SamsItem[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.name === "string" || typeof obj.title === "string") {
        if (obj.price !== undefined || obj.savingsFlag !== undefined || obj.instantSavings !== undefined) {
          items.push(obj as SamsItem);
        }
      }
      for (const val of Object.values(obj)) walk(val);
    }
  }

  walk(json);
  return items;
}

export class LiveSamsClubProvider extends BaseProvider {
  readonly id = "live-sams-club";
  readonly name = "Sam's Club Instant Savings";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly requiresCredentials = false;
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
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    const cacheKey = "live-sams-club:prices";
    const cached = providerCache.get<ProviderPriceData[]>(cacheKey);
    if (cached) return this.success(cached);

    const items = await this.fetchSamsItems();
    const prices: ProviderPriceData[] = [];

    for (const item of items) {
      const name = item.name ?? item.title ?? "";
      if (!name) continue;

      const matched = matchProduct(name, products);
      if (!matched) continue;

      const memberPrice = item.price?.finalPrice?.amount ?? item.price?.currentPrice;
      const listPrice = item.price?.listPrice?.amount ?? item.price?.wasPrice;

      if (memberPrice === undefined && listPrice === undefined) continue;

      const price = listPrice ?? memberPrice!;
      const salePrice = memberPrice !== undefined && (listPrice === undefined || memberPrice < price)
        ? memberPrice
        : null;

      prices.push({
        productSlug: matched.slug,
        storeSlug: "sams-club",
        price,
        salePrice,
        source: this.id,
        confidence: 0.70,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      });
    }

    providerCache.set(cacheKey, prices, CACHE_TTL_MS);
    return this.success(prices);
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const cacheKey = "live-sams-club:opportunities";
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    const items = await this.fetchSamsItems();
    const opportunities: ProviderOpportunityData[] = [];

    const productsWithNorm = products.map(p => ({ ...p, normalizedName: p.name }));

    for (const item of items) {
      const name = item.name ?? item.title ?? "";
      if (!name) continue;

      const memberPrice = item.price?.finalPrice?.amount ?? item.price?.currentPrice;
      const listPrice = item.price?.listPrice?.amount ?? item.price?.wasPrice;
      const savings = parsePrice(item.instantSavings ?? item.savings);

      if (memberPrice === undefined && savings === null) continue;

      const matched = matchProduct(name, productsWithNorm as Pick<Product, "id" | "slug" | "name" | "normalizedName">[]);

      const valueAmount = savings ?? (listPrice !== undefined && memberPrice !== undefined
        ? listPrice - memberPrice
        : memberPrice ?? 0);

      if (valueAmount <= 0 && savings === null) continue;

      opportunities.push({
        type: "STORE_SALE",
        title: name,
        description: item.description,
        storeSlug: "sams-club",
        productSlug: matched?.slug,
        valueType: savings !== null ? "FLAT_DISCOUNT" : "SALE_PRICE",
        valueAmount: savings !== null ? savings : memberPrice ?? 0,
        requiresLoyaltyCard: true,
        confidenceLevel: "PUBLIC_PAGE",
        confidence: 0.70,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      });
    }

    providerCache.set(cacheKey, opportunities, CACHE_TTL_MS);
    return this.success(opportunities);
  }

  private async fetchSamsItems(): Promise<SamsItem[]> {
    // Attempt 1: Sam's Club savings API
    try {
      const response = await fetch(
        "https://www.samsclub.com/api/node/vivaldi/browse/v2/category/savings?response_group=MEDIUM",
        {
          headers: {
            "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
            "Accept": "application/json",
          },
        }
      );

      if (response.ok) {
        const json = await response.json() as unknown;
        const items = extractSamsItems(json);
        if (items.length > 0) return items;
      }
    } catch {
      // Fall through
    }

    // Attempt 2: Parse Sam's Club savings page for __NEXT_DATA__
    try {
      const response = await fetch("https://www.samsclub.com/savings", {
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
          const items = extractSamsItems(nextData);
          if (items.length > 0) return items;
        }
      }
    } catch {
      // Fall through
    }

    return [];
  }
}
