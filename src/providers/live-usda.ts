import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { providerCache } from "./cache";
import { credentialStore } from "./credential-store";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FDC_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

export interface UsdaFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  foodCategory?: string;
  servingSize?: number;
  servingSizeUnit?: string;
}

interface FdcSearchResponse {
  foods?: Array<{
    fdcId?: number;
    description?: string;
    brandOwner?: string;
    foodCategory?: string;
    servingSize?: number;
    servingSizeUnit?: string;
  }>;
}

export class LiveUsdaProvider extends BaseProvider {
  readonly id = "live-usda";
  readonly name = "USDA FoodData Central";
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

  private getApiKey(): string {
    return credentialStore.getCredential("live-usda", "api_key") ?? "DEMO_KEY";
  }

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

  async searchFood(query: string): Promise<UsdaFood[]> {
    const cacheKey = `usda:search:${query}`;
    const cached = providerCache.get<UsdaFood[]>(cacheKey);
    if (cached !== null) return cached;

    try {
      const apiKey = this.getApiKey();
      const url = `${FDC_SEARCH_URL}?query=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}&pageSize=25`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "BudgetBasket/1.0 price-comparison (+https://budgetbasket.app)",
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as FdcSearchResponse;
      const foods: UsdaFood[] = (data.foods ?? []).map((f) => ({
        fdcId: f.fdcId ?? 0,
        description: f.description ?? "",
        brandOwner: f.brandOwner ?? undefined,
        foodCategory: f.foodCategory ?? undefined,
        servingSize: f.servingSize ?? undefined,
        servingSizeUnit: f.servingSizeUnit ?? undefined,
      }));

      providerCache.set(cacheKey, foods, CACHE_TTL_MS);
      return foods;
    } catch {
      return [];
    }
  }
}

export const liveUsdaProvider = new LiveUsdaProvider();
