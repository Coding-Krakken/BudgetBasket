import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { providerCache } from "./cache";

const FLIPP_HEADERS = {
  "User-Agent": "BudgetBasket/1.0 price-comparison (+https://budgetbasket.app)",
  "Accept": "text/html,application/json,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

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

function matchStore(
  name: string,
  stores: Pick<Store, "id" | "slug" | "name">[]
): Pick<Store, "id" | "slug" | "name"> | null {
  const n = name.toLowerCase();
  return (
    stores.find(
      (s) => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n)
    ) ?? null
  );
}

function merchantToSlug(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface FlippFlyerItem {
  id: number;
  name?: string;
  price?: number | null;
  pre_price_text?: string | null;
  original_price?: number | null;
  sale_story?: string | null;
  category_name?: string | null;
  page_number?: number | null;
  image_url?: string | null;
}

interface FlippFlyer {
  id: string | number;
  merchant?: string;
  merchant_logo?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  items?: FlippFlyerItem[];
}

interface FlippFlyerRunsResponse {
  flyers?: FlippFlyer[];
}

async function fetchFlippFlyers(postalCode: string): Promise<FlippFlyer[]> {
  const cacheKey = `flipp:flyers:${postalCode}`;
  const cached = providerCache.get<FlippFlyer[]>(cacheKey);
  if (cached !== null) return cached;

  const url = `https://backflipp.wishabi.com/flipp/flyers/flyer-runs/locate?locale=en-US&postal_code=${encodeURIComponent(postalCode)}&include_flippies=1`;
  const response = await fetch(url, { headers: FLIPP_HEADERS });
  if (!response.ok) {
    throw new Error(`Flipp API returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as FlippFlyerRunsResponse;
  const flyers = data.flyers ?? [];
  providerCache.set(cacheKey, flyers, CACHE_TTL_MS);
  return flyers;
}

export class LiveFlippProvider extends BaseProvider {
  readonly id = "live-flipp";
  readonly name = "Flipp Weekly Ads";
  readonly type = "WEEKLY_AD" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: true,
    opportunities: true,
    weeklyAds: true,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  };

  private get postalCode(): string {
    return process.env.FLIPP_POSTAL_CODE ?? "10001";
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[] = [],
    stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    try {
      const flyers = await fetchFlippFlyers(this.postalCode);
      const opportunities: ProviderOpportunityData[] = [];

      for (const flyer of flyers) {
        if (!flyer.items || !flyer.merchant) continue;
        const merchantSlug = merchantToSlug(flyer.merchant);
        const matchedStore = matchStore(flyer.merchant, stores);
        const storeSlug = matchedStore?.slug ?? merchantSlug;

        const validFrom = flyer.valid_from ? new Date(flyer.valid_from) : null;
        const validTo = flyer.valid_to ? new Date(flyer.valid_to) : null;

        for (const item of flyer.items) {
          if (!item.name) continue;

          const matchedProduct =
            products.length > 0 ? matchProduct(item.name, products) : null;

          if (products.length > 0 && matchedProduct === null) continue;

          const salePrice = item.price ?? null;
          const wasPrice = item.original_price ?? null;
          const savings =
            wasPrice !== null && salePrice !== null ? wasPrice - salePrice : null;

          const title =
            item.sale_story ??
            (salePrice !== null ? `$${salePrice.toFixed(2)}` : item.name);

          opportunities.push({
            type: "WEEKLY_AD_DEAL",
            title,
            description: item.name,
            storeSlug,
            productSlug: matchedProduct?.slug,
            providerRef: String(item.id),
            valueType: "SALE_PRICE",
            valueAmount: salePrice ?? wasPrice ?? 0,
            confidenceLevel: "WEEKLY_AD",
            confidence: 0.8,
            expiresAt: validTo,
            startsAt: validFrom,
            weeklyAd: {
              salePrice,
              wasPrice,
              savings,
              validFrom,
              validTo,
              pageNumber: item.page_number ?? null,
            },
          });
        }
      }

      return this.success(opportunities);
    } catch (err) {
      return this.failure(`Flipp fetchOpportunities error: ${String(err)}`);
    }
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    try {
      const flyers = await fetchFlippFlyers(this.postalCode);
      const prices: ProviderPriceData[] = [];

      for (const flyer of flyers) {
        if (!flyer.items || !flyer.merchant) continue;
        const merchantSlug = merchantToSlug(flyer.merchant);
        const matchedStore = matchStore(flyer.merchant, stores);
        const storeSlug = matchedStore?.slug ?? merchantSlug;

        const validTo = flyer.valid_to ? new Date(flyer.valid_to) : null;

        for (const item of flyer.items) {
          if (!item.name) continue;

          const matchedProduct = matchProduct(item.name, products);
          if (!matchedProduct) continue;

          const itemSalePrice = item.price ?? null;
          const itemRegularPrice = item.original_price ?? item.price ?? null;
          if (itemRegularPrice === null) continue;

          prices.push({
            productSlug: matchedProduct.slug,
            storeSlug,
            price: itemRegularPrice,
            salePrice:
              itemSalePrice !== null && itemSalePrice < itemRegularPrice
                ? itemSalePrice
                : null,
            source: this.id,
            confidence: 0.8,
            expiresAt: validTo,
          });
        }
      }

      return this.success(prices);
    } catch (err) {
      return this.failure(`Flipp fetchPrices error: ${String(err)}`);
    }
  }
}
