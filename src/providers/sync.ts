import {
  ConfidenceLevel,
  OpportunityType,
  PrismaClient,
  StackabilityRule,
} from "@prisma/client";
import db from "@/lib/db";
import { logger } from "@/lib/logger";
import { getProvider } from "./registry";
import type { ProviderFetchResult } from "@/types";
import type { ProviderOpportunityData, ProviderPriceData } from "./base";

type SyncDbClient = Pick<
  PrismaClient,
  "providerSyncRun" | "product" | "store" | "priceObservation" | "opportunity"
>;

export interface ProviderSyncResult {
  providerId: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  pricesIngested: number;
  opportunitiesIngested: number;
  itemsFailed: number;
  errorMessage?: string;
}

export async function syncProviderData(
  providerId: string,
  options: { database?: SyncDbClient } = {}
): Promise<ProviderSyncResult> {
  const database = options.database ?? db;
  const provider = getProvider(providerId);

  if (!provider) {
    return {
      providerId,
      status: "SKIPPED",
      pricesIngested: 0,
      opportunitiesIngested: 0,
      itemsFailed: 0,
      errorMessage: "Provider is not registered.",
    };
  }

  const syncRun = await database.providerSyncRun.create({
    data: {
      providerId: provider.id,
      providerName: provider.name,
      status: "RUNNING",
      metadata: { capabilities: { ...provider.capabilities } },
    },
  });

  try {
    const [products, stores] = await Promise.all([
      database.product.findMany({
        select: { id: true, slug: true, name: true, normalizedName: true },
        orderBy: { name: "asc" },
      }),
      database.store.findMany({
        select: { id: true, slug: true, name: true },
        where: { isActive: true },
      }),
    ]);

    const productIdBySlug = new Map(products.map(product => [product.slug, product.id]));
    const storeIdBySlug = new Map(stores.map(store => [store.slug, store.id]));

    const [priceResult, opportunityResult]: [
      ProviderFetchResult<ProviderPriceData>,
      ProviderFetchResult<ProviderOpportunityData>,
    ] = await Promise.all([
      provider.capabilities.prices ? provider.fetchPrices(products, stores) : emptyFetchResult<ProviderPriceData>(provider.id),
      provider.capabilities.opportunities
        ? provider.fetchOpportunities(products, stores)
        : emptyFetchResult<ProviderOpportunityData>(provider.id),
    ]);

    if (!priceResult.success || !opportunityResult.success) {
      throw new Error(priceResult.error ?? opportunityResult.error ?? "Provider sync failed.");
    }

    let pricesIngested = 0;
    let opportunitiesIngested = 0;
    let itemsFailed = 0;

    await database.priceObservation.updateMany({
      where: { source: provider.id, isActive: true },
      data: { isActive: false },
    });

    await database.opportunity.updateMany({
      where: { providerId: provider.id, isActive: true },
      data: { isActive: false },
    });

    for (const price of priceResult.data) {
      const productId = productIdBySlug.get(price.productSlug);
      const storeId = storeIdBySlug.get(price.storeSlug);
      if (!productId || !storeId) {
        itemsFailed += 1;
        continue;
      }

      await database.priceObservation.create({
        data: {
          productId,
          storeId,
          price: price.price,
          salePrice: price.salePrice ?? null,
          unit: price.unit,
          unitPrice: price.unitPrice ?? null,
          source: provider.id,
          confidence: price.confidence,
          observedAt: priceResult.fetchedAt,
          expiresAt: price.expiresAt ?? null,
          isActive: true,
        },
      });
      pricesIngested += 1;
    }

    for (const opportunity of opportunityResult.data) {
      const productId = opportunity.productSlug ? productIdBySlug.get(opportunity.productSlug) : undefined;
      const storeId = opportunity.storeSlug ? storeIdBySlug.get(opportunity.storeSlug) : undefined;
      if ((opportunity.productSlug && !productId) || (opportunity.storeSlug && !storeId)) {
        itemsFailed += 1;
        continue;
      }

      await database.opportunity.create({
        data: {
          type: toOpportunityType(opportunity.type),
          title: opportunity.title,
          description: opportunity.description,
          storeId,
          productId,
          categorySlug: opportunity.categorySlug,
          brandSlug: opportunity.brandSlug,
          providerId: provider.id,
          valueType: opportunity.valueType,
          valueAmount: opportunity.valueAmount,
          valuePercent: opportunity.valuePercent,
          minimumQuantity: opportunity.minimumQuantity ?? 1,
          requiresBuyQuantity: opportunity.requiresBuyQuantity,
          minimumPurchase: opportunity.minimumPurchase,
          stackability: toStackabilityRule(opportunity.stackability),
          isMfgCoupon: opportunity.isMfgCoupon ?? false,
          requiresClipping: opportunity.requiresClipping ?? false,
          requiresLoyaltyCard: opportunity.requiresLoyaltyCard ?? false,
          requiresAccount: opportunity.requiresAccount ?? false,
          requiresReceipt: opportunity.requiresReceipt ?? false,
          confidenceLevel: toConfidenceLevel(opportunity.confidenceLevel),
          confidence: opportunity.confidence ?? 0.75,
          termsAndConditions: opportunity.termsAndConditions,
          expiresAt: opportunity.expiresAt ?? null,
          isActive: true,
          isVerified: opportunity.confidenceLevel === "OFFICIAL_API",
          isFeatured: opportunity.isFeatured ?? false,
        },
      });
      opportunitiesIngested += 1;
    }

    const status = itemsFailed > 0 ? "SUCCESS_WITH_ERRORS" : "SUCCESS";
    await database.providerSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status,
        completedAt: new Date(),
        itemsIngested: pricesIngested + opportunitiesIngested,
        itemsUpdated: pricesIngested + opportunitiesIngested,
        itemsFailed,
      },
    });

    return {
      providerId: provider.id,
      status: "SUCCESS",
      pricesIngested,
      opportunitiesIngested,
      itemsFailed,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("provider_sync_failed", { providerId: provider.id, error: errorMessage });

    await database.providerSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage,
      },
    });

    return {
      providerId: provider.id,
      status: "FAILED",
      pricesIngested: 0,
      opportunitiesIngested: 0,
      itemsFailed: 0,
      errorMessage,
    };
  }
}

function emptyFetchResult<T>(providerId: string): ProviderFetchResult<T> {
  return {
    providerId,
    success: true,
    data: [],
    fetchedAt: new Date(),
    count: 0,
  };
}

function toOpportunityType(type: string): OpportunityType {
  return Object.values(OpportunityType).includes(type as OpportunityType)
    ? (type as OpportunityType)
    : OpportunityType.DIGITAL_COUPON;
}

function toConfidenceLevel(level?: string): ConfidenceLevel {
  return level && Object.values(ConfidenceLevel).includes(level as ConfidenceLevel)
    ? (level as ConfidenceLevel)
    : ConfidenceLevel.UNKNOWN;
}

function toStackabilityRule(rule?: string): StackabilityRule {
  return rule && Object.values(StackabilityRule).includes(rule as StackabilityRule)
    ? (rule as StackabilityRule)
    : StackabilityRule.STANDALONE;
}
