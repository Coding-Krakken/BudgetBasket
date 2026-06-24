import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { providerCache } from "./cache";
import { fetchJson } from "./utils/html-fetcher";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  ingredients?: string;
  nutriscore?: string;
}

interface OffProductResponse {
  status: number;
  product?: {
    code?: string;
    product_name?: string;
    brands?: string;
    categories?: string;
    image_url?: string;
    ingredients_text?: string;
    nutriscore_grade?: string;
  };
}

interface OffSearchResponse {
  products?: Array<{
    code?: string;
    product_name?: string;
    brands?: string;
    categories?: string;
    image_url?: string;
    ingredients_text?: string;
    nutriscore_grade?: string;
  }>;
}

function mapProduct(raw: NonNullable<OffProductResponse["product"]>, barcode: string): OpenFoodFactsProduct {
  return {
    barcode,
    name: raw.product_name ?? "",
    brand: raw.brands ?? undefined,
    category: raw.categories?.split(",")[0]?.trim() ?? undefined,
    imageUrl: raw.image_url ?? undefined,
    ingredients: raw.ingredients_text ?? undefined,
    nutriscore: raw.nutriscore_grade ?? undefined,
  };
}

export class LiveOpenFoodFactsProvider extends BaseProvider {
  readonly id = "live-open-food-facts";
  readonly name = "Open Food Facts";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly requiresCredentials = false;
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: false,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  };

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([]);
  }

  async fetchOpportunities(
    _products?: Pick<Product, "id" | "slug" | "name">[],
    _stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    return this.success([]);
  }

  async searchByUpc(upc: string): Promise<OpenFoodFactsProduct | null> {
    const cacheKey = `off:upc:${upc}`;
    const cached = providerCache.get<OpenFoodFactsProduct | null>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(upc)}.json`;
      const data = await fetchJson<OffProductResponse>(url, undefined, CACHE_TTL_MS);
      if (data.status !== 1 || !data.product) {
        providerCache.set(cacheKey, null, CACHE_TTL_MS);
        return null;
      }
      const product = mapProduct(data.product, upc);
      providerCache.set(cacheKey, product, CACHE_TTL_MS);
      return product;
    } catch {
      return null;
    }
  }

  async searchByName(name: string): Promise<OpenFoodFactsProduct[]> {
    const cacheKey = `off:name:${name}`;
    const cached = providerCache.get<OpenFoodFactsProduct[]>(cacheKey);
    if (cached !== null) return cached;

    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&json=1&page_size=5`;
      const data = await fetchJson<OffSearchResponse>(url, undefined, CACHE_TTL_MS);
      const products = (data.products ?? []).map((p) =>
        mapProduct(p, p.code ?? "")
      ).filter((p) => p.name);
      providerCache.set(cacheKey, products, CACHE_TTL_MS);
      return products;
    } catch {
      return [];
    }
  }
}

export const liveOpenFoodFactsProvider = new LiveOpenFoodFactsProvider();
