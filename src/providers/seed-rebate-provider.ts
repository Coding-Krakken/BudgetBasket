import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import rebateFeed from "./rebates.demo.json";

type RebateFeedItem = {
  providerName: string;
  title: string;
  description: string;
  productSlug?: string;
  categorySlug?: string;
  valueType: string;
  valueAmount: number;
  validDays: number;
  isFeatured?: boolean;
};

const FEED = rebateFeed as RebateFeedItem[];

export abstract class RebateProvider extends BaseProvider {
  readonly type = "REBATE_APP" as const;
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: true,
  };

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([]);
  }

  protected mapRebate(item: RebateFeedItem, expiresAt: Date): ProviderOpportunityData {
    return {
      type: "REBATE",
      title: item.title,
      description: item.description,
      productSlug: item.productSlug,
      categorySlug: item.categorySlug,
      valueType: item.valueType,
      valueAmount: item.valueAmount,
      stackability: "STACKABLE_WITH_ALL",
      requiresReceipt: true,
      confidenceLevel: "SEED_DEMO",
      confidence: 0.78,
      termsAndConditions: `Submit receipt in ${item.providerName} after purchase.`,
      expiresAt,
      isFeatured: item.isFeatured ?? false,
    };
  }
}

export class SeedIbottaProvider extends RebateProvider {
  readonly id = "seed-ibotta";
  readonly name = "Ibotta (Demo Rebates)";
  readonly isDemo = true;

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const productSlugs = new Set(products.map(product => product.slug));
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.success(
      FEED
        .filter(item => item.providerName === "Ibotta")
        .filter(item => !item.productSlug || productSlugs.has(item.productSlug))
        .map(item => this.mapRebate(item, expiresAt))
    );
  }
}

export class SeedFetchRewardsProvider extends RebateProvider {
  readonly id = "seed-fetch";
  readonly name = "Fetch Rewards (Demo Rebates)";
  readonly isDemo = true;

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const productSlugs = new Set(products.map(product => product.slug));
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.success(
      FEED
        .filter(item => item.providerName === "Fetch")
        .filter(item => !item.productSlug || productSlugs.has(item.productSlug))
        .map(item => ({
          ...this.mapRebate(item, expiresAt),
          confidence: 0.75,
        }))
    );
  }
}
