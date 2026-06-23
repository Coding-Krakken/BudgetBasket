import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";

export class SeedWalmartProvider extends BaseProvider {
  readonly id = "seed-walmart";
  readonly name = "Walmart (Demo)";
  readonly type = "RETAILER" as const;
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
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    const priceMap: Record<string, { price: number; salePrice?: number }> = {
      "whole-milk-gallon": { price: 3.96 },
      "2-percent-milk-gallon": { price: 3.76 },
      "eggs-large-dozen": { price: 2.97 },
      "chicken-breast-boneless": { price: 3.98, salePrice: 3.48 },
      "bananas": { price: 0.44 },
      "cheerios-18oz": { price: 4.74 },
      "tide-pods-32ct": { price: 14.97 },
      "toothpaste-crest-65oz": { price: 4.12 },
      "paper-towels-bounty-8pk": { price: 13.97 },
      "toilet-paper-charmin-12pk": { price: 18.97 },
      "coke-12pack": { price: 7.98 },
      "water-case-16oz-24ct": { price: 3.98 },
      "lysol-spray-19oz": { price: 4.97 },
      "dawn-dish-soap-24oz": { price: 4.97 },
      "cheddar-cheese-block-8oz": { price: 2.98 },
    };

    const results: ProviderPriceData[] = products
      .filter(p => priceMap[p.slug])
      .map(p => ({
        productSlug: p.slug,
        storeSlug: "walmart",
        price: priceMap[p.slug].price,
        salePrice: priceMap[p.slug].salePrice ?? null,
        source: this.id,
        confidence: 0.75,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }));

    return this.success(results);
  }

  async fetchOpportunities(
    _products?: Pick<Product, "id" | "slug" | "name">[],
    _stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const opportunities: ProviderOpportunityData[] = [
      {
        type: "STORE_SALE",
        title: "Chicken Breast BOGO 50% Off",
        description: "Buy one boneless skinless chicken breast, get second 50% off.",
        storeSlug: "walmart",
        productSlug: "chicken-breast-boneless",
        valueType: "PERCENT_OFF_SECOND",
        valueAmount: 0.50,
        valuePercent: 50,
        minimumQuantity: 2,
        stackability: "STACKABLE_WITH_MFG",
        requiresClipping: false,
        confidenceLevel: "SEED_DEMO",
        confidence: 0.75,
        isFeatured: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      {
        type: "DIGITAL_COUPON",
        title: "$1 Off Cheerios 18oz",
        description: "Clip digital coupon in Walmart app for $1 off Cheerios.",
        storeSlug: "walmart",
        productSlug: "cheerios-18oz",
        valueType: "FIXED_OFF",
        valueAmount: 1.00,
        stackability: "STACKABLE_WITH_MFG",
        requiresClipping: true,
        requiresAccount: true,
        confidenceLevel: "SEED_DEMO",
        confidence: 0.75,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    ];

    return this.success(opportunities);
  }
}
