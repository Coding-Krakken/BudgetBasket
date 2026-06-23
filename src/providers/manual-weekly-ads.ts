import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import weeklyAdFeed from "./weekly-ads.demo.json";

type WeeklyAdFeedItem = {
  title: string;
  description: string;
  storeSlug: string;
  productSlug: string;
  salePrice: number;
  wasPrice?: number;
  validDays: number;
  isFeatured?: boolean;
};

const FEED = weeklyAdFeed as WeeklyAdFeedItem[];

export class ManualWeeklyAdProvider extends BaseProvider {
  readonly id = "seed-flipp";
  readonly name = "Flipp Weekly Ads (Manual Import)";
  readonly type = "WEEKLY_AD" as const;
  readonly isDemo = true;
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
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    const productSlugs = new Set(products.map(product => product.slug));
    const storeSlugs = new Set(stores.map(store => store.slug));
    const expiresAt = this.expiresAt();

    return this.success(
      FEED
        .filter(item => productSlugs.has(item.productSlug) && storeSlugs.has(item.storeSlug))
        .map(item => ({
          productSlug: item.productSlug,
          storeSlug: item.storeSlug,
          price: item.wasPrice ?? item.salePrice,
          salePrice: item.salePrice,
          source: this.id,
          confidence: 0.8,
          expiresAt,
        }))
    );
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const productSlugs = new Set(products.map(product => product.slug));
    const storeSlugs = new Set(stores.map(store => store.slug));
    const expiresAt = this.expiresAt();

    return this.success(
      FEED
        .filter(item => productSlugs.has(item.productSlug) && storeSlugs.has(item.storeSlug))
        .map(item => ({
          type: "WEEKLY_AD_DEAL",
          title: item.title,
          description: item.description,
          storeSlug: item.storeSlug,
          productSlug: item.productSlug,
          valueType: "SALE_PRICE",
          valueAmount: item.salePrice,
          stackability: "STACKABLE_WITH_MFG",
          confidenceLevel: "WEEKLY_AD",
          confidence: 0.8,
          expiresAt,
          isFeatured: item.isFeatured ?? false,
        }))
    );
  }

  private expiresAt() {
    const longestFeedWindow = Math.max(...FEED.map(item => item.validDays));
    return new Date(Date.now() + longestFeedWindow * 24 * 60 * 60 * 1000);
  }
}
