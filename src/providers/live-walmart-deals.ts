import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { providerCache } from "./cache";

const FETCH_HEADERS = {
  "User-Agent": "BudgetBasket/1.0 price-comparison (+https://budgetbasket.app)",
  "Accept": "text/html,application/json,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function matchProduct(
  text: string,
  products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[]
): Pick<Product, "id" | "slug" | "name" | "normalizedName"> | null {
  const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  return (
    products.find((p) => {
      const pn = p.normalizedName.toLowerCase();
      const words = pn.split(" ").filter((w) => w.length > 3);
      return words.length > 0 && words.every((w) => norm.includes(w));
    }) ?? null
  );
}

interface WalmartPriceInfo {
  currentPrice?: { price?: number };
  wasPrice?: { price?: number } | null;
}

interface WalmartItem {
  name?: string;
  priceInfo?: WalmartPriceInfo;
  type?: string;
  productType?: string;
  availabilityStatusDisplayValue?: string;
  shortDescription?: string;
  id?: string;
  usItemId?: string;
}

interface WalmartItemStack {
  items?: WalmartItem[];
}

interface WalmartNextData {
  props?: {
    pageProps?: {
      initialData?: {
        searchResult?: {
          itemStacks?: WalmartItemStack[];
        };
      };
    };
  };
}

function extractNextData(html: string): WalmartNextData | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as WalmartNextData;
  } catch {
    return null;
  }
}

async function fetchWalmartDeals(): Promise<WalmartItem[]> {
  const cacheKey = "walmart:deals:page";
  const cached = providerCache.get<WalmartItem[]>(cacheKey);
  if (cached !== null) return cached;

  const response = await fetch("https://www.walmart.com/shop/deals", {
    headers: FETCH_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Walmart deals page returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const nextData = extractNextData(html);
  const itemStacks =
    nextData?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? [];

  const items: WalmartItem[] = [];
  for (const stack of itemStacks) {
    if (stack.items) {
      items.push(...stack.items);
    }
  }

  providerCache.set(cacheKey, items, CACHE_TTL_MS);
  return items;
}

export class LiveWalmartDealsProvider extends BaseProvider {
  readonly id = "live-walmart-deals";
  readonly name = "Walmart Deals & Rollbacks";
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

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    try {
      const items = await fetchWalmartDeals();
      const opportunities: ProviderOpportunityData[] = [];

      for (const item of items) {
        if (!item.name) continue;

        const matchedProduct =
          products.length > 0 ? matchProduct(item.name, products) : null;
        if (products.length > 0 && matchedProduct === null) continue;

        const currentPrice = item.priceInfo?.currentPrice?.price ?? null;
        const wasPrice = item.priceInfo?.wasPrice?.price ?? null;

        if (currentPrice === null) continue;

        const savings =
          wasPrice !== null && wasPrice > currentPrice ? wasPrice - currentPrice : null;

        opportunities.push({
          type: "STORE_SALE",
          title:
            savings !== null
              ? `Save $${savings.toFixed(2)} on ${item.name}`
              : `$${currentPrice.toFixed(2)} — ${item.name}`,
          description: item.shortDescription ?? item.name,
          storeSlug: "walmart",
          productSlug: matchedProduct?.slug,
          providerRef: item.usItemId ?? item.id,
          valueType: "SALE_PRICE",
          valueAmount: currentPrice,
          valuePercent:
            wasPrice !== null && wasPrice > 0
              ? Math.round(((wasPrice - currentPrice) / wasPrice) * 100)
              : undefined,
          confidenceLevel: "PUBLIC_PAGE",
          confidence: 0.7,
        });
      }

      return this.success(opportunities);
    } catch (err) {
      return this.failure(`Walmart fetchOpportunities error: ${String(err)}`);
    }
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    try {
      const items = await fetchWalmartDeals();
      const prices: ProviderPriceData[] = [];

      for (const item of items) {
        if (!item.name) continue;

        const matchedProduct = matchProduct(item.name, products);
        if (!matchedProduct) continue;

        const currentPrice = item.priceInfo?.currentPrice?.price ?? null;
        const wasPrice = item.priceInfo?.wasPrice?.price ?? null;

        if (currentPrice === null) continue;

        const regularPrice = wasPrice ?? currentPrice;
        const salePrice =
          wasPrice !== null && currentPrice < wasPrice ? currentPrice : null;

        prices.push({
          productSlug: matchedProduct.slug,
          storeSlug: "walmart",
          price: regularPrice,
          salePrice,
          source: this.id,
          confidence: 0.7,
        });
      }

      return this.success(prices);
    } catch (err) {
      return this.failure(`Walmart fetchPrices error: ${String(err)}`);
    }
  }
}
